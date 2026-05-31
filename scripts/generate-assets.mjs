import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const sourceDir = path.join(rootDir, 'src/pictures');
const publicPhotoDir = path.join(rootDir, 'public/static/photos');
const generatedDir = path.join(rootDir, 'src/generated');
const catalogPath = path.join(rootDir, 'src/photo-catalog.json');
const widths = [480, 960, 1600, 2400];
const formats = [
  {
    type: 'image/avif',
    extension: 'avif',
    options: { quality: 45, effort: 4 },
  },
  { type: 'image/webp', extension: 'webp', options: { quality: 78 } },
  {
    type: 'image/jpeg',
    extension: 'jpg',
    options: { quality: 82, mozjpeg: true, progressive: true },
  },
];

const slugify = (value) =>
  value
    .replace(/\.[^.]+$/, '')
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');

const escapeHtml = (value) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

const uniqueWidthsFor = (sourceWidth) => {
  const maxOutputWidth = Math.min(sourceWidth, widths.at(-1));
  const selected = widths.filter((width) => width <= maxOutputWidth);
  const withOriginal =
    selected.length > 0 ? selected : [Math.max(1, Math.round(sourceWidth))];

  return [...new Set(withOriginal)].sort((a, b) => a - b);
};

const renderSource = ({ type, srcset }, sizes) =>
  `<source type="${type}" srcset="${escapeHtml(srcset)}" sizes="${escapeHtml(sizes)}">`;

// The frame is bounded by BOTH the available width and the viewport height
// (CSS max-block-size). For a portrait, the height cap is what limits the
// rendered width, so the displayed width is min(widthCap, heightCap * aspect).
// Expressing that here stops tall photos from over-fetching a too-wide variant.
const frameSizes = (photo) => {
  const aspect = photo.aspectRatio;

  return (
    `(max-width: 899px) min(calc(100vw - 2rem), calc((100vh - 12rem) * ${aspect})), ` +
    `min(calc(100vw - 18rem), calc((100vh - 5rem) * ${aspect}))`
  );
};

const renderPicture = (
  photo,
  sizes,
  imgAttributes = '',
  src = photo.fallback.src
) => {
  const [avif, webp, jpeg] = photo.sources;

  return `<picture>
      ${renderSource(avif, sizes)}
      ${renderSource(webp, sizes)}
      <img src="${src}" srcset="${escapeHtml(jpeg.srcset)}" sizes="${escapeHtml(sizes)}" width="${photo.width}" height="${photo.height}" alt="${escapeHtml(photo.alt)}" ${imgAttributes}>
    </picture>`;
};

const renderThumbnail = (photo, isCurrent) => {
  const sizes =
    photo.orientation === 'landscape'
      ? '(max-width: 899px) 32vmin, 12vmin'
      : '(max-width: 899px) 18vmin, 8vmin';

  const smallestJpeg = photo.sources.find(
    (source) => source.type === 'image/jpeg'
  ).variants[0];

  // The frame is built at runtime by cloning this thumbnail's <picture>, so the
  // data the frame needs but the thumbnail markup lacks is carried on data-*.
  const dataAttributes = [
    `data-photo-id="${photo.id}"`,
    `data-order="${photo.order}"`,
    `data-caption="${escapeHtml(photo.caption)}"`,
    `data-frame-src="${photo.fallback.src}"`,
    `data-frame-sizes="${escapeHtml(frameSizes(photo))}"`,
  ].join(' ');

  return `<a class="thumbnail thumbnail--${photo.orientation}" href="${photo.fallback.src}" ${dataAttributes}${isCurrent ? ' aria-current="true"' : ''}>
    ${renderPicture(photo, sizes, 'loading="lazy" decoding="async"', smallestJpeg.src)}
  </a>`;
};

const renderFrame = (photo) => `<figure class="frame-figure">
    ${renderPicture(
      photo,
      frameSizes(photo),
      'id="frame-image" decoding="async" fetchpriority="high"'
    )}
    <figcaption id="frame-caption">${escapeHtml(photo.caption)}</figcaption>
  </figure>`;

const validateCatalog = (catalog) => {
  if (!Array.isArray(catalog)) {
    throw new Error('Photo catalog must be an array.');
  }

  const seen = new Set();

  for (const [index, entry] of catalog.entries()) {
    if (!entry || typeof entry.file !== 'string' || entry.file.trim() === '') {
      throw new Error(
        `Photo catalog entry ${index + 1} needs a non-empty "file".`
      );
    }

    if (seen.has(entry.file)) {
      throw new Error(`Duplicate photo catalog entry: ${entry.file}`);
    }

    seen.add(entry.file);
  }
};

const assertCatalogMatchesFiles = async (catalog) => {
  const sourceFiles = new Set(
    (await readdir(sourceDir)).filter((file) => /\.jpe?g$/i.test(file))
  );
  const catalogFiles = new Set(catalog.map((entry) => entry.file));

  for (const file of sourceFiles) {
    if (!catalogFiles.has(file)) {
      throw new Error(`Photo catalog is missing ${file}`);
    }
  }

  for (const file of catalogFiles) {
    if (!sourceFiles.has(file)) {
      throw new Error(`Photo catalog references missing file ${file}`);
    }
  }
};

const generate = async () => {
  const rawCatalog = JSON.parse(await readFile(catalogPath, 'utf8'));
  validateCatalog(rawCatalog);

  const catalog = rawCatalog.map((entry, index) => ({
    ...entry,
    id: slugify(entry.file),
    order: index + 1,
  }));

  await assertCatalogMatchesFiles(catalog);
  await mkdir(publicPhotoDir, { recursive: true });
  await mkdir(generatedDir, { recursive: true });

  // Variant filenames embed a hash of their source image, so any file that
  // already exists is already up to date. Skip re-encoding those and prune
  // only the ones no longer referenced. Regenerating every variant from
  // scratch takes minutes and would blow the Playwright preview server's
  // startup timeout.
  const existingFiles = new Set(await readdir(publicPhotoDir));
  const expectedFiles = new Set();

  const photos = [];

  for (const entry of catalog) {
    const inputPath = path.join(sourceDir, entry.file);
    const input = await readFile(inputPath);
    const hash = createHash('sha256').update(input).digest('hex').slice(0, 10);
    const metadata = await sharp(input).rotate().metadata();

    if (!metadata.width || !metadata.height) {
      throw new Error(`Could not read dimensions for ${entry.file}`);
    }

    const outputWidths = uniqueWidthsFor(metadata.width);
    const sources = [];

    for (const format of formats) {
      const variants = outputWidths.map((width) => {
        const height = Math.round((width / metadata.width) * metadata.height);
        const filename = `${entry.id}-${hash}-${width}.${format.extension}`;
        expectedFiles.add(filename);

        return {
          filename,
          outputPath: path.join(publicPhotoDir, filename),
          src: `static/photos/${filename}`,
          width,
          height,
        };
      });

      await Promise.all(
        variants
          .filter(({ filename }) => !existingFiles.has(filename))
          .map(async ({ outputPath, width }) => {
            const pipeline = sharp(input).rotate().resize({
              width,
              withoutEnlargement: true,
            });

            if (format.extension === 'avif') {
              await pipeline.avif(format.options).toFile(outputPath);
            } else if (format.extension === 'webp') {
              await pipeline.webp(format.options).toFile(outputPath);
            } else {
              await pipeline.jpeg(format.options).toFile(outputPath);
            }
          })
      );

      sources.push({
        type: format.type,
        variants: variants.map(({ src, width, height }) => ({
          src,
          width,
          height,
        })),
        srcset: variants
          .map((variant) => `${variant.src} ${variant.width}w`)
          .join(', '),
      });
    }

    const jpegSource = sources.find((source) => source.type === 'image/jpeg');
    const fallback = jpegSource.variants.at(-1);

    photos.push({
      id: entry.id,
      file: entry.file,
      order: entry.order,
      alt: entry.alt,
      caption: entry.caption,
      orientation: metadata.width >= metadata.height ? 'landscape' : 'portrait',
      width: metadata.width,
      height: metadata.height,
      aspectRatio: Number((metadata.width / metadata.height).toFixed(4)),
      sources,
      fallback,
    });
  }

  // Drop variants that are no longer referenced: deleted photos, or sources
  // whose content changed (and so produced a new hash in their filename).
  await Promise.all(
    [...existingFiles]
      .filter((filename) => !expectedFiles.has(filename))
      .map((filename) =>
        rm(path.join(publicPhotoDir, filename), { force: true })
      )
  );

  const firstPhoto = photos[0];
  const portraits = photos
    .filter((photo) => photo.orientation === 'portrait')
    .map((photo) => renderThumbnail(photo, photo.id === firstPhoto.id))
    .join('\n');
  const landscapes = photos
    .filter((photo) => photo.orientation === 'landscape')
    .map((photo) => renderThumbnail(photo, photo.id === firstPhoto.id))
    .join('\n');
  const galleryHtml = `<!-- portraits -->
${portraits}
<!-- /portraits -->
<!-- frame -->
${renderFrame(firstPhoto)}
<!-- /frame -->
<!-- landscapes -->
${landscapes}
<!-- /landscapes -->
`;

  await writeFile(path.join(generatedDir, 'gallery.html'), galleryHtml);
  console.log(
    `Generated ${photos.length} photos and ${photos.reduce(
      (count, photo) =>
        count +
        photo.sources.reduce(
          (sourceCount, source) => sourceCount + source.variants.length,
          0
        ),
      0
    )} responsive assets.`
  );
};

await generate();
