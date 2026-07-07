export interface UIPack {
    borderRadius: number;
    borderWidth: number;
    panelOpacity: number;
    glowIntensity: number;

    spacing: {
        xs: string;
        sm: string;
        md: string;
        lg: string;
        xl: string;
        xxl: string;
    };

    control: {
        heightSm: string;
        heightMd: string;
        heightLg: string;
        paddingX: string;
        gap: string;
    };

    panel: {
        padding: string;
        headerHeight: string;
        gap: string;
    };

    zIndex: {
        base: number;
        overlay: number;
        popover: number;
        modal: number;
        toast: number;
    };
}