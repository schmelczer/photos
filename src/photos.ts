import type { ImageSource, Photo } from './photo-types';

const AUTO_ADVANCE_DELAY_MS = 7000;
const FRAME_SIZES =
  '(max-width: 899px) calc(100vw - 2rem), calc(100vw - 18rem)';

type GalleryOptions = {
  readonly photos: readonly Photo[];
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

const createSource = (source: ImageSource): HTMLSourceElement => {
  const element = document.createElement('source');
  element.type = source.type;
  element.srcset = source.srcset;
  element.sizes = FRAME_SIZES;

  return element;
};

const createFrameFigure = (photo: Photo): HTMLElement => {
  const figure = document.createElement('figure');
  figure.className = 'frame-figure';

  const picture = document.createElement('picture');

  for (const source of photo.sources.filter(
    ({ type }) => type !== 'image/jpeg'
  )) {
    picture.append(createSource(source));
  }

  const jpeg = photo.sources.find(({ type }) => type === 'image/jpeg');
  const image = document.createElement('img');
  image.id = 'frame-image';
  image.src = photo.fallback.src;
  image.srcset = jpeg?.srcset ?? '';
  image.sizes = FRAME_SIZES;
  image.width = photo.width;
  image.height = photo.height;
  image.alt = photo.alt;
  image.decoding = 'async';
  image.fetchPriority = 'high';

  picture.append(image);

  const caption = document.createElement('figcaption');
  caption.id = 'frame-caption';
  caption.textContent = photo.caption;

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
    if (options.photos.length === 0) {
      throw new Error('The gallery needs at least one photo.');
    }

    this.thumbnails = this.options.photos.map((photo) =>
      this.thumbnailFor(photo)
    );
    this.addEventListeners();
    this.select(0);

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
      if (!this.options.gallery.contains(event.target as Node)) {
        return;
      }

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
          this.select(this.options.photos.length - 1, {
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
    this.options.gallery.addEventListener(
      'touchstart',
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

  private thumbnailFor(photo: Photo): HTMLAnchorElement {
    const thumbnail = this.options.gallery.querySelector<HTMLAnchorElement>(
      `[data-photo-id="${CSS.escape(photo.id)}"]`
    );

    if (!thumbnail) {
      throw new Error(`Missing thumbnail for ${photo.id}.`);
    }

    return thumbnail;
  }

  private selectById(id: string | undefined, options: SelectOptions): void {
    const index = this.options.photos.findIndex((photo) => photo.id === id);

    if (index >= 0) {
      this.select(index, options);
    }
  }

  private select(value: number, options: SelectOptions = {}): void {
    this.selectedIndex = wrapIndex(value, this.options.photos.length);
    const photo = this.options.photos[this.selectedIndex];

    if (!photo) {
      throw new Error('Selected photo is missing.');
    }

    this.options.frame.replaceChildren(createFrameFigure(photo));
    this.updateSelectedThumbnail(photo, options.focusThumbnail ?? false);

    if (options.pause) {
      this.pauseAutoAdvance();
    }
  }

  private updateSelectedThumbnail(photo: Photo, shouldFocus: boolean): void {
    for (const thumbnail of this.thumbnails) {
      const selected = thumbnail.dataset.photoId === photo.id;
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
    }
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
