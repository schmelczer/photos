import { describe, expect, it, vi } from 'vitest';
import { PhotoGallery, wrapIndex } from './photos';
import type { Photo } from './photo-types';

const variant = (name: string) => ({
  src: `static/photos/${name}.jpg`,
  width: 320,
  height: 240,
});

const photo = (id: string, alt: string): Photo => ({
  id,
  file: `${id}.jpg`,
  order: 1,
  alt,
  caption: alt,
  orientation: 'landscape',
  width: 320,
  height: 240,
  aspectRatio: 1.3333,
  sources: [
    {
      type: 'image/avif',
      variants: [variant(`${id}.avif`)],
      srcset: `static/photos/${id}.avif 320w`,
    },
    {
      type: 'image/webp',
      variants: [variant(`${id}.webp`)],
      srcset: `static/photos/${id}.webp 320w`,
    },
    {
      type: 'image/jpeg',
      variants: [variant(`${id}.jpg`)],
      srcset: `static/photos/${id}.jpg 320w`,
    },
  ],
  fallback: variant(`${id}.jpg`),
});

const setup = () => {
  vi.stubGlobal('CSS', {
    escape: (value: string) => value,
  });
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    media: '(prefers-reduced-motion: reduce)',
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
  window.HTMLElement.prototype.scrollIntoView = vi.fn();

  document.body.innerHTML = `
    <main id="gallery">
      <a href="static/photos/one.jpg" data-photo-id="one">One</a>
      <a href="static/photos/two.jpg" data-photo-id="two">Two</a>
    </main>
    <section id="frame"></section>
    <button id="toggle" type="button">Play</button>
  `;

  const gallery = document.querySelector<HTMLElement>('#gallery');
  const frame = document.querySelector<HTMLElement>('#frame');
  const toggle = document.querySelector<HTMLButtonElement>('#toggle');

  if (!gallery || !frame || !toggle) {
    throw new Error('Test DOM failed to initialize.');
  }

  return {
    gallery,
    frame,
    toggle,
    photos: [photo('one', 'First photo'), photo('two', 'Second photo')],
  };
};

describe('wrapIndex', () => {
  it('wraps backward to the last item', () => {
    expect(wrapIndex(-1, 4)).toBe(3);
  });

  it('wraps forward to the first item', () => {
    expect(wrapIndex(4, 4)).toBe(0);
  });

  it('rejects empty collections', () => {
    expect(() => wrapIndex(0, 0)).toThrow('without items');
  });
});

describe('PhotoGallery', () => {
  it('updates the frame and selected state when a thumbnail is clicked', () => {
    const { gallery, frame, toggle, photos } = setup();
    new PhotoGallery({ photos, gallery, frame, toggle, autoAdvance: false });

    gallery
      .querySelector<HTMLAnchorElement>('[data-photo-id="two"]')
      ?.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true })
      );

    expect(frame.querySelector('img')?.alt).toBe('Second photo');
    expect(
      gallery
        .querySelector('[data-photo-id="two"]')
        ?.getAttribute('aria-current')
    ).toBe('true');
  });

  it('uses scoped arrow-key navigation', () => {
    const { gallery, frame, toggle, photos } = setup();
    new PhotoGallery({ photos, gallery, frame, toggle, autoAdvance: false });

    gallery.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'ArrowLeft',
        bubbles: true,
        cancelable: true,
      })
    );

    expect(frame.querySelector('img')?.alt).toBe('Second photo');
  });
});
