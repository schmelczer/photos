import './index.scss';
import { PhotoGallery, requiredElement } from './photos';

document.documentElement.classList.add('js');

const gallery = requiredElement<HTMLElement>('#gallery', HTMLElement);
const frame = requiredElement<HTMLElement>('#frame-content', HTMLElement);
const toggle = requiredElement<HTMLButtonElement>(
  '#slideshow-toggle',
  HTMLButtonElement
);

new PhotoGallery({
  gallery,
  frame,
  toggle,
});
