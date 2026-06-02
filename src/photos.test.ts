import { describe, expect, it, vi } from 'vitest';
import { PhotoGallery, wrapIndex } from './photos';

const thumbnail = (id: string, order: number, alt: string): string => `
  <a
    class="thumbnail"
    href="static/photos/${id}-2400.jpg"
    data-photo-id="${id}"
    data-order="${order}"
    data-frame-src="static/photos/${id}-2400.jpg"
    data-frame-sizes="100vw"
  >
    <picture>
      <source type="image/avif" srcset="static/photos/${id}-480.avif 480w" sizes="8vmin" />
      <source type="image/webp" srcset="static/photos/${id}-480.webp 480w" sizes="8vmin" />
      <img
        src="static/photos/${id}-480.jpg"
        srcset="static/photos/${id}-480.jpg 480w"
        sizes="8vmin"
        width="320"
        height="240"
        alt="${alt}"
        loading="lazy"
        decoding="async"
      />
    </picture>
  </a>`;

const setup = () => {
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
      ${thumbnail('one', 1, 'First photo')}
      ${thumbnail('two', 2, 'Second photo')}
    </main>
    <section class="frame"><div id="frame-content"></div></section>
    <button id="toggle" type="button">Play</button>
  `;

  const gallery = document.querySelector<HTMLElement>('#gallery');
  const frame = document.querySelector<HTMLElement>('#frame-content');
  const toggle = document.querySelector<HTMLButtonElement>('#toggle');

  if (!gallery || !frame || !toggle) {
    throw new Error('Test DOM failed to initialize.');
  }

  return { gallery, frame, toggle };
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
  it('builds the frame from the clicked thumbnail and marks it current', () => {
    const { gallery, frame, toggle } = setup();
    new PhotoGallery({ gallery, frame, toggle, autoAdvance: false });

    gallery
      .querySelector<HTMLAnchorElement>('[data-photo-id="two"]')
      ?.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true })
      );

    const image = frame.querySelector('img');
    expect(image?.alt).toBe('Second photo');
    expect(image?.id).toBe('frame-image');
    expect(image?.getAttribute('src')).toBe('static/photos/two-2400.jpg');
    expect(
      gallery
        .querySelector('[data-photo-id="two"]')
        ?.getAttribute('aria-current')
    ).toBe('true');
  });

  it('wraps with arrow-key navigation', () => {
    const { gallery, frame, toggle } = setup();
    new PhotoGallery({ gallery, frame, toggle, autoAdvance: false });

    gallery.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'ArrowLeft',
        bubbles: true,
        cancelable: true,
      })
    );

    expect(frame.querySelector('img')?.alt).toBe('Second photo');
  });

  it('preloads the next photo off-screen without duplicating the frame id', () => {
    const { gallery, frame, toggle } = setup();
    new PhotoGallery({ gallery, frame, toggle, autoAdvance: false });

    const preload = document.querySelector('.frame-preload img');
    expect(preload?.getAttribute('src')).toBe('static/photos/two-2400.jpg');
    // The off-screen copy must not steal the displayed image's id.
    expect(preload?.id).toBe('');
    expect(document.querySelectorAll('#frame-image')).toHaveLength(0);
  });

  it('moves the preload to the next photo as the selection advances', () => {
    const { gallery, frame, toggle } = setup();
    new PhotoGallery({ gallery, frame, toggle, autoAdvance: false });

    gallery
      .querySelector<HTMLAnchorElement>('[data-photo-id="two"]')
      ?.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true })
      );

    // Showing 'two' leaves exactly one framed image and preloads the wrap-around.
    expect(document.querySelectorAll('#frame-image')).toHaveLength(1);
    expect(
      document.querySelector('.frame-preload img')?.getAttribute('src')
    ).toBe('static/photos/one-2400.jpg');
  });

  it('sets the aspect ratio so the frame reserves the photo size before it loads', () => {
    const { gallery, frame, toggle } = setup();
    new PhotoGallery({ gallery, frame, toggle, autoAdvance: false });

    gallery
      .querySelector<HTMLAnchorElement>('[data-photo-id="one"]')
      ?.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true })
      );

    // Thumbnail markup is 320x240, so the figure carries that ratio for CSS.
    const figure = frame.querySelector<HTMLElement>('.frame-figure');
    expect(
      parseFloat(figure?.style.getPropertyValue('--frame-ratio') ?? '')
    ).toBeCloseTo(320 / 240, 4);
  });

  it('shows a loading animation for a user load and clears it when ready', () => {
    const { gallery, frame, toggle } = setup();
    new PhotoGallery({ gallery, frame, toggle, autoAdvance: false });

    // 'one' is not the preloaded photo, so clicking it builds a fresh figure
    // whose image is still loading.
    gallery
      .querySelector<HTMLAnchorElement>('[data-photo-id="one"]')
      ?.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true })
      );

    expect(frame.classList.contains('is-loading')).toBe(true);

    frame.querySelector('img')?.dispatchEvent(new Event('load'));
    expect(frame.classList.contains('is-loading')).toBe(false);
  });
});
