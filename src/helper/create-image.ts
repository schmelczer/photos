import { ResponsiveImage } from '../model/responsive-image';
import { last } from './last';

export const createImage = (
  image: ResponsiveImage,
  alt: string,
  tabIndex: number,
  imageScreenRatio = 0.25
): HTMLImageElement => {
  const img = new Image(image.width, image.height);

  img.tabIndex = tabIndex;
  img.srcset = image.srcSet;
  img.sizes =
    image.images
      .map(d => `(max-width: ${d.width / imageScreenRatio}px) ${d.width}px,`)
      .join('\n') + `\n${last(image.images).width}px`;
  img.src = last(image.images)?.path;
  img.alt = alt;

  return img;
};
