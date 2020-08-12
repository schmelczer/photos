import './index.scss';
import { Photos } from './photos';

// @ts-ignore
const images = require.context('./pictures', true, /.jpg$/);
const imagePath = name => images(name, true);

const addSupportForTabNavigation = () =>
  (document.onkeydown = e => {
    if (e.key === ' ') {
      (document.activeElement as HTMLElement)?.click();
      e.preventDefault();
    }
  });

const sizeFrame = () => {
  const container = document.querySelector('#frame-container') as HTMLElement;
  const image = container.querySelector('img');

  image.style.maxWidth = container.clientWidth + 'px';
  image.style.left = container.offsetLeft + container.clientWidth / 2 + 'px';
};

new Photos(
  images.keys().map(k => imagePath(k)),
  document.querySelector('#landscapes'),
  document.querySelector('#portraits'),
  document.querySelector('#frame-image')
);

addSupportForTabNavigation();
window.addEventListener('resize', sizeFrame);
sizeFrame();
