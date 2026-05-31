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
    options: { quality: 45, effort: 0 },
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

  return `<a class="thumbnail thumbnail--${photo.orientation}" href="${photo.fallback.src}" data-photo-id="${photo.id}"${isCurrent ? ' aria-current="true"' : ''}>
    ${renderPicture(photo, sizes, 'loading="lazy" decoding="async"', smallestJpeg.src)}
  </a>`;
};

const renderFrame = (photo) => `<figure class="frame-figure">
    ${renderPicture(
      photo,
      '(max-width: 899px) calc(100vw - 2rem), calc(100vw - 18rem)',
      'id="frame-image" decoding="async" fetchpriority="high"'
    )}
    <figcaption id="frame-caption">${escapeHtml(photo.caption)}</figcaption>
  </figure>`;

const assertCatalogMatchesFiles = async (catalog) => {
  const sourceFiles = new Set(
    (await readdir(sourceDir)).filter((file) =>
      file.toLowerCase().endsWith('.jpg')
    )
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
  const catalog = JSON.parse(await readFile(catalogPath, 'utf8')).map(
    (entry, index) => ({
      ...entry,
      id: slugify(entry.file),
      order: index + 1,
    })
  );

  await assertCatalogMatchesFiles(catalog);
  await rm(publicPhotoDir, { recursive: true, force: true });
  await mkdir(publicPhotoDir, { recursive: true });
  await mkdir(generatedDir, { recursive: true });

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

        return {
          outputPath: path.join(publicPhotoDir, filename),
          src: `static/photos/${filename}`,
          width,
          height,
        };
      });

      await Promise.all(
        variants.map(async ({ outputPath, width }) => {
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

  const module = `import type { Photo } from '../photo-types';

export const photos = ${JSON.stringify(photos, null, 2)} as const satisfies readonly Photo[];
`;

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

  await writeFile(path.join(generatedDir, 'photos.ts'), module);
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
