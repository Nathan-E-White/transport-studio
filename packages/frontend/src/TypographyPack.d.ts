export interface TypographyPack {
    fontFamily: {
        body: string;
        heading: string;
        mono: string;
    };

    fontSize: {
        xs: string;
        sm: string;
        md: string;
        lg: string;
        xl: string;
        xxl: string;
        display: string;
    };

    fontWeight: {
        regular: number;
        medium: number;
        semibold: number;
        bold: number;
    };

    lineHeight: {
        tight: number;
        heading: number;
        body: number;
        relaxed: number;
        mono: number;
    };

    letterSpacing: {
        tight: string;
        normal: string;
        wide: string;
        label: string;
    };
}