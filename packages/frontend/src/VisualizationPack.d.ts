export interface VisualizationPack {
    particle: {
        primary: string;
        secondary: string;
        neutral: string;
        charged: string;
        photon: string;
        neutron: string;
        electron: string;
        warning: string;
    };

    tracks: {
        default: string;
        selected: string;
        faded: string;
        collision: string;
        absorption: string;
        scattering: string;
    };

    heatmap: {
        low: string;
        lowMid: string;
        mid: string;
        highMid: string;
        high: string;
        gradient: readonly string[];
    };

    dose: {
        low: string;
        moderate: string;
        elevated: string;
        high: string;
        critical: string;
        gradient: readonly string[];
    };

    vectorField: {
        streamline: string;
        streamlineMuted: string;
        glyph: string;
        glyphSelected: string;
        curl: string;
        divergence: string;
    };

    geometry: {
        surface: string;
        surfaceSelected: string;
        surfaceWireframe: string;
        region: string;
        regionSelected: string;
        boundary: string;
    };

    tally: {
        palette: readonly string[];
        histogram: string;
        line: string;
        area: string;
        uncertainty: string;
    };

    grid: {
        major: string;
        minor: string;
        axisX: string;
        axisY: string;
        axisZ: string;
    };
}