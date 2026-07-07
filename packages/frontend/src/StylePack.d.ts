import type {VisualizationPack} from "./VisualizationPack";
import type {EffectsPack} from "./EffectsPack";
import type {UIPack} from "./UIPack";
import type {SurfacePack} from "./SurfacePack";
import type {TypographyPack} from "./TypographyPack";
import type {ColorPalette} from "./ColorPalette";
import type {StyleTokens} from "./StyleToken";

export type StylePackID = string;

export interface StylePack {
    id: StylePackID;

    displayName: string;
    description: string;

    tokens: StyleTokens;

    colors: ColorPalette;
    typography: TypographyPack;
    surfaces: SurfacePack;
    visualization: VisualizationPack;
    effects: EffectsPack;
    ui: UIPack;
}
