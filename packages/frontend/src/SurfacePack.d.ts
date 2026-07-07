export interface SurfacePack {
    radius: {
        none: string;
        sm: string;
        md: string;
        lg: string;
        xl: string;
        pill: string;
    };

    borderWidth: {
        hairline: string;
        thin: string;
        standard: string;
        strong: string;
    };

    panel: {
        background: string;
        elevatedBackground: string;
        insetBackground: string;
        border: string;
        borderMuted: string;
        borderStrong: string;
        opacity: number;
        backdropBlur: string;
    };

    glass: {
        background: string;
        border: string;
        opacity: number;
        backdropBlur: string;
    };
}