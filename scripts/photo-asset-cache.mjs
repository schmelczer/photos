import { rename, rm, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

// Published variants are immutable: their names include the source image and
// encoding settings hash. This cache is optional; misses are encoded locally.
export const createPhotoAssetCache = (baseUrl) => {
  let available = Boolean(baseUrl);
  const base = baseUrl ? new URL(baseUrl.replace(/\/?$/, '/')) : null;

  return async ({ filename, outputPath, width, height, extension }) => {
    if (!available) return false;

    const temporaryPath = `${outputPath}.tmp`;
    try {
      const response = await fetch(
        new URL(encodeURIComponent(filename), base),
        {
          signal: AbortSignal.timeout(5_000),
          redirect: 'error',
        }
      );
      if (response.status === 404) return false;
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const buffer = Buffer.from(await response.arrayBuffer());
      const metadata = await sharp(buffer).metadata();
      const expectedFormat = { avif: 'heif', webp: 'webp', jpg: 'jpeg' }[
        extension
      ];
      if (
        metadata.width !== width ||
        metadata.height !== height ||
        metadata.format !== expectedFormat ||
        (extension === 'avif' && metadata.compression !== 'av1')
      ) {
        return false;
      }

      await writeFile(temporaryPath, buffer);
      await rename(temporaryPath, outputPath);
      return true;
    } catch (error) {
      // A network outage should cost one timeout, not one for every variant.
      if (available) {
        console.warn(`Published photo cache unavailable: ${error.message}`);
      }
      available = false;
      return false;
    } finally {
      await rm(temporaryPath, { force: true });
    }
  };
};
