// @vitest-environment node
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPhotoAssetCache } from './photo-asset-cache.mjs';

describe('published photo cache', () => {
  let directory;
  let variant;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'photo-cache-test-'));
    variant = {
      filename: 'photo-sourcehash-4.webp',
      outputPath: path.join(directory, 'photo-sourcehash-4.webp'),
      width: 4,
      height: 3,
      extension: 'webp',
    };
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(directory, { recursive: true, force: true });
  });

  const image = (format, width = 4) =>
    sharp({
      create: { width, height: 3, channels: 3, background: '#a63446' },
    })
      .toFormat(format)
      .toBuffer();

  it.each([
    ['avif', 'avif'],
    ['webp', 'webp'],
    ['jpg', 'jpeg'],
  ])('restores a complete %s variant', async (extension, format) => {
    const bytes = await image(format);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(bytes));
    const restore = createPhotoAssetCache('https://photos.example/static/');

    expect(await restore({ ...variant, extension })).toBe(true);
    expect(await readFile(variant.outputPath)).toEqual(bytes);
    expect(await readdir(directory)).toEqual([variant.filename]);
  });

  it('leaves offline builds independent of the published site', async () => {
    const request = vi.spyOn(globalThis, 'fetch');
    expect(await createPhotoAssetCache()(variant)).toBe(false);
    expect(request).not.toHaveBeenCalled();
  });

  it('allows a new photo to miss without disabling other cache hits', async () => {
    const bytes = await image('webp');
    const request = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(bytes));
    const restore = createPhotoAssetCache('https://photos.example/static/');

    expect(await restore(variant)).toBe(false);
    expect(await readdir(directory)).toEqual([]);
    expect(await restore(variant)).toBe(true);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('rejects cached images with the wrong dimensions or format', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(await image('webp', 8)))
      .mockResolvedValueOnce(new Response(await image('jpeg')));
    const restore = createPhotoAssetCache('https://photos.example/static/');

    expect(await restore(variant)).toBe(false);
    expect(await restore(variant)).toBe(false);
    expect(await readdir(directory)).toEqual([]);
  });

  it('rejects an HTML response instead of saving it as a photo', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('<html>not an image</html>')
    );
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(
      await createPhotoAssetCache('https://photos.example/static/')(variant)
    ).toBe(false);
    expect(await readdir(directory)).toEqual([]);
  });

  it('avoids repeated network timeouts during an outage', async () => {
    const request = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('timeout'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const restore = createPhotoAssetCache('https://photos.example/static/');

    expect(await restore(variant)).toBe(false);
    expect(await restore(variant)).toBe(false);
    expect(request).toHaveBeenCalledTimes(1);
    expect(await readdir(directory)).toEqual([]);
  });

  it('never saves a partially downloaded variant', async () => {
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2, 3]));
          controller.error(new Error('connection closed'));
        },
      })
    );
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response);
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(
      await createPhotoAssetCache('https://photos.example/static/')(variant)
    ).toBe(false);
    expect(await readdir(directory)).toEqual([]);
  });
});
