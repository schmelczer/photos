declare module '*.svg' {
  const content: string;
  export default content;
}

declare module '*.jpg' {
  import { ResponsiveImage } from 'src/model/responsive-image';
  const content: ResponsiveImage;
  export default content;
}

declare module '*.jpeg' {
  import { ResponsiveImage } from 'src/model/responsive-image';
  const content: ResponsiveImage;
  export default content;
}

declare module '*.txt' {
  const content: string;
  export default content;
}

declare module '*.html' {
  const content: string;
  export default content;
}
