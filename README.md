# Photos

A static, progressively enhanced photo portfolio for András Schmelczer.

## Requirements

- Node `22.13.0` or newer compatible with `.nvmrc`
- npm `10.9.0` or newer

Install with:

```sh
npm ci
```

## Development

```sh
npm run dev
```

The dev server binds to `127.0.0.1` by default. This generates responsive image assets and the typed photo manifest before Vite starts.

## Build

```sh
npm run build
```

The build writes to `dist/`. Static files come from `public/`, and responsive photo assets are generated into `public/static/photos/`.

## Quality Gates

Run the full local validation suite with:

```sh
npm run lint:check
```

This checks formatting, type-checks, lints TypeScript and SCSS, checks source photos for EXIF/XMP/IPTC metadata, and validates the photo catalog against `src/pictures/`. Image encoding runs separately as part of the build.

Run unit tests separately:

```sh
npm test
```

Use `npm run lint` to apply Prettier formatting and auto-fixable ESLint/Stylelint issues.

End-to-end smoke tests are available separately:

```sh
npm run test:e2e
```

Playwright requires a browser installation. CI installs Chromium before running the smoke test.

## Photo Catalog

Photo order, captions, and alt text live in `src/photo-catalog.json`. Add new source JPEGs to `src/pictures/`, then add a matching catalog entry. `npm run dev`, `npm run lint:check`, and `npm run build` validate that the catalog and source directory match.

The generated files under `src/generated/` and `public/static/photos/` are intentionally ignored because they are reproducible from the source images and catalog.

CI sets `PHOTO_ASSET_CACHE_URL=https://photos.schmelczer.dev/static/photos/` to reuse published image variants. Filenames include a hash of the source photo and encoding settings, so changed photos or settings produce new files. Downloads are checked for image format and dimensions and saved atomically. Missing variants are encoded locally with the same quality settings. Builds without this variable work offline; a clean build encoding every photo can take around 25 minutes on the two-core runner. The generator reports progress for each photo.

## Gallery Navigation

Photo selections use `#photo=<id>` links, where the ID comes from the source filename rather than its position or generated asset hash. Selecting a thumbnail or using the arrow, Home, or End keys updates the URL; thumbnails can also be copied or opened in another tab. Reloading or opening a photo link selects that photo with the slideshow paused. Back and Forward restore selections, and automatic slideshow advances replace the current URL without adding history entries. Missing or unknown IDs fall back to the first photo.

The header's Portfolio link returns to `https://schmelczer.dev/`. Without JavaScript, thumbnails still link directly to photo assets.

## Metadata

Source photos should not contain private EXIF/XMP/IPTC metadata. Check with:

```sh
npm run lint:check
```

Strip metadata with:

```sh
node scripts/strip-image-metadata.mjs
```

Review image changes after stripping because this rewrites the JPEG files.

## Deployment

The Forgejo workflow validates pull requests and trusted pushes with `npm ci`, `npm run lint:check`, `npm test`, `npm run build`, and a Playwright smoke test. CI previews the existing build for the smoke test instead of rebuilding. Trusted human pushes to `main` hand that validated `dist/` artifact to the deploy job and the Pages copier, which publishes it to `/pages/photos/` without another build.
