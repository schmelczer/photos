const AUTO_ADVANCE_DELAY_MS = 7000;

type GalleryOptions = {
  readonly gallery: HTMLElement;
  readonly frame: HTMLElement;
  readonly toggle: HTMLButtonElement;
  readonly autoAdvance?: boolean;
  readonly onSelect?: (info: { photoId: string; source: string }) => void;
};

type SelectOptions = {
  readonly focusThumbnail?: boolean;
  readonly pause?: boolean;
  readonly source?: string;
  readonly updateUrl?: boolean;
};

const photoHash = (id: string): string =>
  `#${new URLSearchParams({ photo: id })}`;

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
// fallback src and the frame-appropriate `sizes` — both carried on the
// thumbnail's data-* attributes by the asset generator.
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

  // The `frame-image` id is assigned by showFigure when the figure is placed in
  // the frame, so a figure waiting in the preload holder never duplicates it.
  if (thumbnail.dataset.frameSrc) {
    image.src = thumbnail.dataset.frameSrc;
  }
  image.removeAttribute('loading');
  image.decoding = 'async';

  figure.append(picture);

  return figure;
};

export class PhotoGallery {
  private selectedIndex = 0;
  private timerId: number | null = null;
  private preloaded: { index: number; figure: HTMLElement } | null = null;
  private readonly thumbnails: HTMLAnchorElement[];
  private readonly preloadHolder = document.createElement('div');
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

    // Keep asset links as the no-JavaScript fallback, but let enhanced
    // thumbnails be copied or opened in another tab as gallery deep links.
    for (const thumbnail of this.thumbnails) {
      thumbnail.href = photoHash(thumbnail.dataset.photoId ?? '');
    }

    // Off-screen holder that warms the next photo's image so advancing to it is
    // instant; see preloadNext.
    this.preloadHolder.className = 'frame-preload';
    this.preloadHolder.setAttribute('aria-hidden', 'true');
    document.body.append(this.preloadHolder);

    this.addEventListeners();

    const linkedIndex = this.indexFromUrl();
    if (linkedIndex > 0) {
      this.select(linkedIndex, { updateUrl: false });
    } else {
      // Preserve the server-rendered first photo and its in-flight LCP image.
      this.updateSelectedThumbnail(0, false);
      this.preloadNext();
    }

    if (
      linkedIndex < 0 &&
      this.options.autoAdvance !== false &&
      !this.reducedMotion.matches
    ) {
      this.startAutoAdvance();
    } else {
      this.updateToggle(false);
    }
  }

  private addEventListeners(): void {
    window.addEventListener('hashchange', () => {
      this.select(Math.max(0, this.indexFromUrl()), {
        pause: true,
        updateUrl: false,
      });
    });

    this.options.gallery.addEventListener('click', (event) => {
      if (
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const thumbnail = (event.target as Element).closest<HTMLAnchorElement>(
        '[data-photo-id]'
      );

      if (!thumbnail) {
        return;
      }

      event.preventDefault();
      this.selectById(thumbnail.dataset.photoId, {
        pause: true,
        source: 'thumbnail',
      });
    });

    this.options.gallery.addEventListener('keydown', (event) => {
      switch (event.key) {
        case 'ArrowLeft':
          event.preventDefault();
          this.select(this.selectedIndex - 1, {
            focusThumbnail: true,
            pause: true,
            source: 'keyboard',
          });
          break;
        case 'ArrowRight':
          event.preventDefault();
          this.select(this.selectedIndex + 1, {
            focusThumbnail: true,
            pause: true,
            source: 'keyboard',
          });
          break;
        case 'Home':
          event.preventDefault();
          this.select(0, {
            focusThumbnail: true,
            pause: true,
            source: 'keyboard',
          });
          break;
        case 'End':
          event.preventDefault();
          this.select(this.thumbnails.length - 1, {
            focusThumbnail: true,
            pause: true,
            source: 'keyboard',
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

  private indexFromUrl(): number {
    const id = new URLSearchParams(window.location.hash.slice(1)).get('photo');
    return this.thumbnails.findIndex(
      (thumbnail) => thumbnail.dataset.photoId === id
    );
  }

  private updatePhotoUrl(id: string, recordHistory: boolean): void {
    const url = new URL(window.location.href);
    url.hash = photoHash(id);
    if (url.href === window.location.href) {
      return;
    }

    if (recordHistory) {
      window.history.pushState(window.history.state, '', url);
    } else {
      // The slideshow keeps the current photo shareable without adding a
      // history entry every seven seconds.
      window.history.replaceState(window.history.state, '', url);
    }
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

    // Auto-advance shows the preloaded figure instantly; a user-initiated jump
    // (which carries a source) may need a download, so it gets the spinner.
    this.showFigure(this.takeFigure(this.selectedIndex, thumbnail), {
      loading: options.source !== undefined || options.updateUrl === false,
    });
    this.updateSelectedThumbnail(
      this.selectedIndex,
      options.focusThumbnail ?? false
    );

    if (options.pause) {
      this.pauseAutoAdvance();
    }

    if (options.updateUrl !== false) {
      this.updatePhotoUrl(
        thumbnail.dataset.photoId ?? '',
        options.source !== undefined
      );
    }

    // Only user-initiated selections carry a source; auto-advance stays
    // untracked so the slideshow doesn't flood analytics every few seconds.
    if (options.source) {
      this.options.onSelect?.({
        photoId: thumbnail.dataset.photoId ?? '',
        source: options.source,
      });
    }

    this.preloadNext();
  }

  // Reuse the figure preloaded for this index when we have it — the browser has
  // already fetched its image — otherwise build a fresh one.
  private takeFigure(index: number, thumbnail: HTMLAnchorElement): HTMLElement {
    if (this.preloaded?.index === index) {
      const { figure } = this.preloaded;
      this.preloaded = null;
      return figure;
    }

    return createFrameFigure(thumbnail);
  }

  private showFigure(figure: HTMLElement, options: { loading: boolean }): void {
    const image = figure.querySelector('img');
    if (image) {
      image.id = 'frame-image';
    }

    this.options.frame.replaceChildren(figure);

    // Show a spinner only while a not-yet-loaded image arrives; a preloaded
    // (already complete) image is displayed immediately, with no flash.
    if (options.loading && image && !image.complete) {
      this.options.frame.classList.add('is-loading');
      const clear = (): void =>
        this.options.frame.classList.remove('is-loading');
      image.addEventListener('load', clear, { once: true });
      image.addEventListener('error', clear, { once: true });
    } else {
      this.options.frame.classList.remove('is-loading');
    }
  }

  // Build the photo the slideshow will advance to next and park it off-screen
  // so the browser downloads it before we need to show it.
  private preloadNext(): void {
    if (this.thumbnails.length <= 1) {
      return;
    }

    const nextIndex = wrapIndex(this.selectedIndex + 1, this.thumbnails.length);
    if (this.preloaded?.index === nextIndex) {
      return;
    }

    const thumbnail = this.thumbnails[nextIndex];
    if (!thumbnail) {
      return;
    }

    const figure = createFrameFigure(thumbnail);
    this.preloaded = { index: nextIndex, figure };
    this.preloadHolder.replaceChildren(figure);
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
