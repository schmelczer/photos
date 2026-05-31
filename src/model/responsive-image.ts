export type ResponsiveImage = {
    srcSet: string;
    src: string;
    placeholder: string;
    width: number;
    height: number;
    images: Array<{
        path: string;
        width: number;
        height: number;
    }>;
};
