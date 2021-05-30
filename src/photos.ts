import { ResponsiveImage } from './model/responsive-image';
import { createImage } from './helper/create-image';

export class Photos {
  private readonly images: Array<HTMLImageElement>;
  private _selectedId: number;
  private timerId: NodeJS.Timeout = null;
  private shouldNotChange = false;

  public constructor(
    images: Array<ResponsiveImage>,
    private readonly landscapesContainer: HTMLElement,
    private readonly portraitsContainer: HTMLElement,
    private readonly pictureFrame: HTMLImageElement
  ) {
    this.images = this.convertImages(images);
    this.placeImages();
    this.addEventListeners();
    this.startAutoChange();
    this.selectedId = 0;
  }

  private get selectedId(): number {
    return this._selectedId;
  }

  private set selectedId(value: number) {
    if (value < 0) {
      value += this.images.length - 1;
    }
    this._selectedId = value % this.images.length;
    this.loadToFrame(this.images[this.selectedId]);
    this.images[this.selectedId].focus();
    this.shouldNotChange = true;
  }

  private convertImages(images: Array<ResponsiveImage>) {
    let portraits = 0; // evens
    let landscapes = 1; // odds

    const imgs = images.map((image, i) =>
      createImage(
        image,
        'a photo',
        Photos.isLandscape(image) ? (landscapes += 2) : (portraits += 2)
      )
    );

    return imgs.sort((a, b) => a.tabIndex - b.tabIndex);
  }

  private placeImages() {
    this.images.forEach(img => {
      if (Photos.isLandscape(img)) {
        img.classList.add('landscape');
        this.landscapesContainer.appendChild(img);
      } else {
        img.classList.add('portrait');
        this.portraitsContainer.appendChild(img);
      }
    });
  }

  private addEventListeners() {
    window.document.addEventListener('keydown', e => {
      switch (e.key) {
        case 'ArrowLeft':
          this.selectedId--;
          break;
        case 'ArrowRight':
          this.selectedId++;
          break;
        case 'Tab':
          if (this.timerId !== null) {
            clearInterval(this.timerId);
            this.timerId = null;
          }
      }
    });

    window.document.addEventListener(
      'scroll',
      () => (this.shouldNotChange = true)
    );

    this.images.forEach((image, i) =>
      image.addEventListener('click', () => (this.selectedId = i))
    );
  }

  private startAutoChange() {
    this.timerId = setInterval(() => {
      if (!this.shouldNotChange) {
        this.selectedId++;
      }
      this.shouldNotChange = false;
    }, 7000);
  }

  private loadToFrame(img: HTMLImageElement) {
    this.pictureFrame.src = img.src;
  }

  private static isLandscape(
    image: HTMLImageElement | ResponsiveImage
  ): boolean {
    return image.width > image.height;
  }
}
