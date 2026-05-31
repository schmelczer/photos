const AUTO_ADVANCE_DELAY_MS = 7000;

type GalleryOptions = {
  readonly gallery: HTMLElement;
  readonly frame: HTMLElement;
  readonly toggle: HTMLButtonElement;
  readonly autoAdvance?: boolean;
};

type SelectOptions = {
  readonly focusThumbnail?: boolean;
  readonly pause?: boolean;
};

export const requiredElement = <T extends Element>(
  selector: string,
  constructor: { new (...args: never[]): T }
): T => {
  const element = document.querySelector(selector);

  if (!(element instanceof constructor)) {
    throw new Error(`Required element not found: ${selector}`);
  }

  return element;
};

export const wrapIndex = (value: number, count: number): number => {
  if (count <= 0) {
    throw new Error('Cannot wrap an index without items.');
  }

  return ((value % count) + count) % count;
};

// Build the frame figure by cloning the thumbnail's own <picture>. The variant
// files are identical to the frame's, so the only differences are the larger
// fallback src, the frame-appropriate `sizes`, and the caption — all carried on
// the thumbnail's data-* attributes by the asset generator.
const createFrameFigure = (thumbnail: HTMLAnchorElement): HTMLElement => {
  const figure = document.createElement('figure');
  figure.className = 'frame-figure';

  const original = thumbnail.querySelector('picture');
  if (!original) {
    throw new Error(
      `Thumbnail is missing a picture: ${thumbnail.dataset.photoId}`
    );
  }

  const picture = original.cloneNode(true) as HTMLElement;
  const image = picture.querySelector('img');
  if (!image) {
    throw new Error(
      `Thumbnail is missing an image: ${thumbnail.dataset.photoId}`
    );
  }

  const sizes = thumbnail.dataset.frameSizes ?? '';
  for (const element of picture.querySelectorAll('source, img')) {
    element.setAttribute('sizes', sizes);
  }

  image.id = 'frame-image';
  if (thumbnail.dataset.frameSrc) {
    image.src = thumbnail.dataset.frameSrc;
  }
  image.removeAttribute('loading');
  image.decoding = 'async';

  const caption = document.createElement('figcaption');
  caption.id = 'frame-caption';
  caption.textContent = thumbnail.dataset.caption ?? '';

  figure.append(picture, caption);

  return figure;
};

export class PhotoGallery {
  private selectedIndex = 0;
  private timerId: number | null = null;
  private readonly thumbnails: HTMLAnchorElement[];
  private readonly reducedMotion = window.matchMedia(
    '(prefers-reduced-motion: reduce)'
  );

  public constructor(private readonly options: GalleryOptions) {
    this.thumbnails = Array.from(
      options.gallery.querySelectorAll<HTMLAnchorElement>('[data-photo-id]')
    ).sort((a, b) => Number(a.dataset.order) - Number(b.dataset.order));

    if (this.thumbnails.length === 0) {
      throw new Error('The gallery needs at least one photo.');
    }

    this.addEventListeners();

    // The frame for photo 0 is already server-rendered, so just mark the
    // selected thumbnail; rebuilding it would discard the in-flight LCP image.
    this.updateSelectedThumbnail(0, false);

    if (this.options.autoAdvance !== false && !this.reducedMotion.matches) {
      this.startAutoAdvance();
    } else {
      this.updateToggle(false);
    }
  }

  private addEventListeners(): void {
    this.options.gallery.addEventListener('click', (event) => {
      const thumbnail = (event.target as Element).closest<HTMLAnchorElement>(
        '[data-photo-id]'
      );

      if (!thumbnail) {
        return;
      }

      event.preventDefault();
      this.selectById(thumbnail.dataset.photoId, { pause: true });
    });

    this.options.gallery.addEventListener('keydown', (event) => {
      switch (event.key) {
        case 'ArrowLeft':
          event.preventDefault();
          this.select(this.selectedIndex - 1, {
            focusThumbnail: true,
            pause: true,
          });
          break;
        case 'ArrowRight':
          event.preventDefault();
          this.select(this.selectedIndex + 1, {
            focusThumbnail: true,
            pause: true,
          });
          break;
        case 'Home':
          event.preventDefault();
          this.select(0, { focusThumbnail: true, pause: true });
          break;
        case 'End':
          event.preventDefault();
          this.select(this.thumbnails.length - 1, {
            focusThumbnail: true,
            pause: true,
          });
          break;
      }
    });

    this.options.gallery.addEventListener('pointerdown', () =>
      this.pauseAutoAdvance()
    );
    this.options.gallery.addEventListener(
      'wheel',
      () => this.pauseAutoAdvance(),
      { passive: true }
    );

    this.options.toggle.addEventListener('click', () => {
      if (this.timerId === null) {
        this.startAutoAdvance();
      } else {
        this.pauseAutoAdvance();
      }
    });

    this.reducedMotion.addEventListener('change', () => {
      if (this.reducedMotion.matches) {
        this.pauseAutoAdvance();
      }
    });
  }

  private selectById(id: string | undefined, options: SelectOptions): void {
    const index = this.thumbnails.findIndex(
      (thumbnail) => thumbnail.dataset.photoId === id
    );

    if (index >= 0) {
      this.select(index, options);
    }
  }

  private select(value: number, options: SelectOptions = {}): void {
    this.selectedIndex = wrapIndex(value, this.thumbnails.length);
    const thumbnail = this.thumbnails[this.selectedIndex];

    if (!thumbnail) {
      throw new Error('Selected photo is missing.');
    }

    this.options.frame.replaceChildren(createFrameFigure(thumbnail));
    this.updateSelectedThumbnail(
      this.selectedIndex,
      options.focusThumbnail ?? false
    );

    if (options.pause) {
      this.pauseAutoAdvance();
    }
  }

  private updateSelectedThumbnail(index: number, shouldFocus: boolean): void {
    this.thumbnails.forEach((thumbnail, i) => {
      const selected = i === index;
      if (selected) {
        thumbnail.setAttribute('aria-current', 'true');
      } else {
        thumbnail.removeAttribute('aria-current');
      }
      thumbnail.classList.toggle('is-selected', selected);

      if (selected && shouldFocus) {
        thumbnail.focus({ preventScroll: true });
        thumbnail.scrollIntoView({
          block: 'nearest',
          inline: 'nearest',
        });
      }
    });
  }

  private startAutoAdvance(): void {
    this.pauseAutoAdvance(false);

    if (this.reducedMotion.matches) {
      this.updateToggle(false);
      return;
    }

    this.timerId = window.setInterval(() => {
      this.select(this.selectedIndex + 1);
    }, AUTO_ADVANCE_DELAY_MS);
    this.updateToggle(true);
  }

  private pauseAutoAdvance(updateToggle = true): void {
    if (this.timerId !== null) {
      window.clearInterval(this.timerId);
      this.timerId = null;
    }

    if (updateToggle) {
      this.updateToggle(false);
    }
  }

  private updateToggle(isRunning: boolean): void {
    this.options.toggle.setAttribute('aria-pressed', String(isRunning));
    this.options.toggle.textContent = isRunning ? 'Pause' : 'Play';
  }
}
