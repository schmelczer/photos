import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const sourceDir = path.join(rootDir, 'src/pictures');
const catalogPath = path.join(rootDir, 'src/photo-catalog.json');

const isJpeg = (file) => /\.(jpe?g)$/i.test(file);

const formatList = (items) => items.map((item) => `- ${item}`).join('\n');

const main = async () => {
  const sourceFiles = (await readdir(sourceDir)).filter(isJpeg).sort();
  const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));

  if (!Array.isArray(catalog)) {
    throw new Error('Photo catalog must be an array.');
  }

  const catalogFiles = catalog.map((entry, index) => {
    if (!entry || typeof entry !== 'object') {
      throw new Error(`Photo catalog entry ${index + 1} must be an object.`);
    }

    if (typeof entry.file !== 'string' || entry.file.trim() === '') {
      throw new Error(`Photo catalog entry ${index + 1} is missing "file".`);
    }

    return entry.file;
  });

  const sourceFileSet = new Set(sourceFiles);
  const catalogFileSet = new Set(catalogFiles);
  const duplicateFiles = catalogFiles
    .filter((file, index) => catalogFiles.indexOf(file) !== index)
    .filter((file, index, files) => files.indexOf(file) === index)
    .sort();
  const missingFromCatalog = sourceFiles.filter(
    (file) => !catalogFileSet.has(file)
  );
  const missingFromPictures = catalogFiles
    .filter((file) => !sourceFileSet.has(file))
    .sort();

  if (
    duplicateFiles.length > 0 ||
    missingFromCatalog.length > 0 ||
    missingFromPictures.length > 0
  ) {
    const sections = [];

    if (duplicateFiles.length > 0) {
      sections.push(
        `Duplicate catalog file entries:\n${formatList(duplicateFiles)}`
      );
    }

    if (missingFromCatalog.length > 0) {
      sections.push(
        `Photos missing from src/photo-catalog.json:\n${formatList(
          missingFromCatalog
        )}`
      );
    }

    if (missingFromPictures.length > 0) {
      sections.push(
        `Catalog entries missing from src/pictures:\n${formatList(
          missingFromPictures
        )}`
      );
    }

    throw new Error(sections.join('\n\n'));
  }

  console.log(
    `Photo catalog includes all ${sourceFiles.length} source photos.`
  );
};

await main();
