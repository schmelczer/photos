import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

const SITE_URL = 'https://schmelczer.dev/photos/';

const readGallerySection = (name: string): string => {
  try {
    const html = readFileSync(
      resolve(__dirname, 'src/generated/gallery.html'),
      'utf8'
    );
    const match = html.match(
      new RegExp(`<!-- ${name} -->([\\s\\S]*?)<!-- /${name} -->`)
    );

    return match?.[1]?.trim() ?? '';
  } catch {
    return '';
  }
};

const generatedGalleryPlugin = (): Plugin => ({
  name: 'generated-gallery',
  transformIndexHtml(html) {
    const ogImageUrl = new URL('og-image.jpg', SITE_URL).toString();

    return html
      .replaceAll('__SITE_URL__', SITE_URL)
      .replaceAll('__OG_IMAGE_URL__', ogImageUrl)
      .replace('<!-- gallery:portraits -->', readGallerySection('portraits'))
      .replace('<!-- gallery:frame -->', readGallerySection('frame'))
      .replace('<!-- gallery:landscapes -->', readGallerySection('landscapes'));
  },
});

export default defineConfig({
  base: './',
  root: 'src',
  publicDir: '../public',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    assetsDir: 'assets',
    sourcemap: false,
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: false,
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: false,
  },
  plugins: [generatedGalleryPlugin()],
});
