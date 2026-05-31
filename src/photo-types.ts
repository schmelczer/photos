export type PhotoOrientation = 'landscape' | 'portrait';
export type ImageMimeType = 'image/avif' | 'image/webp' | 'image/jpeg';

export type ImageVariant = {
  readonly src: string;
  readonly width: number;
  readonly height: number;
};

export type ImageSource = {
  readonly type: ImageMimeType;
  readonly variants: readonly ImageVariant[];
  readonly srcset: string;
};

export type Photo = {
  readonly id: string;
  readonly file: string;
  readonly order: number;
  readonly alt: string;
  readonly caption: string;
  readonly orientation: PhotoOrientation;
  readonly width: number;
  readonly height: number;
  readonly aspectRatio: number;
  readonly sources: readonly ImageSource[];
  readonly fallback: ImageVariant;
};
