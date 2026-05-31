import './index.scss';
import { photos } from './generated/photos';
import { PhotoGallery, requiredElement } from './photos';

document.documentElement.classList.add('js');

const gallery = requiredElement<HTMLElement>('#gallery', HTMLElement);
const frame = requiredElement<HTMLElement>('#frame-content', HTMLElement);
const toggle = requiredElement<HTMLButtonElement>(
  '#slideshow-toggle',
  HTMLButtonElement
);

new PhotoGallery({
  photos,
  gallery,
  frame,
  toggle,
});
