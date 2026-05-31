import { readdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const pictureDir = path.join(rootDir, 'src/pictures');

const files = (await readdir(pictureDir)).filter((file) =>
  file.toLowerCase().endsWith('.jpg')
);

let stripped = 0;

for (const file of files) {
  const sourcePath = path.join(pictureDir, file);
  const metadata = await sharp(sourcePath).metadata();

  if (!metadata.exif && !metadata.xmp && !metadata.iptc) {
    continue;
  }

  const tempPath = `${sourcePath}.stripped`;

  try {
    await sharp(sourcePath)
      .rotate()
      .jpeg({ quality: 95, mozjpeg: true, progressive: true })
      .toFile(tempPath);
    await rename(tempPath, sourcePath);
    stripped += 1;
  } catch (error) {
    await rm(tempPath, { force: true });
    throw error;
  }
}

console.log(`Stripped metadata from ${stripped} source photos.`);
