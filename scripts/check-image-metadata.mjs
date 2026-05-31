import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const pictureDir = path.join(rootDir, 'src/pictures');

const files = (await readdir(pictureDir)).filter((file) =>
  file.toLowerCase().endsWith('.jpg')
);

const offenders = [];

for (const file of files) {
  const metadata = await sharp(path.join(pictureDir, file)).metadata();

  if (metadata.exif || metadata.xmp || metadata.iptc) {
    offenders.push(file);
  }
}

if (offenders.length > 0) {
  console.error('Private image metadata found in source photos:');
  for (const file of offenders) {
    console.error(`- ${file}`);
  }
  console.error(
    'Run `node scripts/strip-image-metadata.mjs` and review the image changes.'
  );
  process.exit(1);
}

console.log(
  `Checked ${files.length} source photos for EXIF/XMP/IPTC metadata.`
);
