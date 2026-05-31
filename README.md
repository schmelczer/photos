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

This generates assets (validating the photo catalog against `src/pictures/` in the process), checks source photos for EXIF/XMP/IPTC metadata, type-checks, lints TypeScript and SCSS, and checks formatting.

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

The Forgejo workflow validates pull requests and trusted pushes with `npm ci`, `npm run lint:check`, `npm test`, `npm run build`, and a Playwright smoke test. Only pushes to `main` deploy, by copying `dist/` to `/pages/photos/`.
