import {StylePack} from "../../../StylePack";
import {defaultColors} from "./colors";
import {defaultEffects} from "./effects";
import {defaultTokens} from "./tokens";
import {defaultTypography} from "./typography";
import {defaultVisualization} from "./visualization";
import {defaultSurfaces} from "./surfaces";
import {defaultUI} from "./ui";

export const defaultPack: StylePack = {
    id: "default",
    displayName: "Default",
    description: "Default Transport Studio interface theme.",
    colors: defaultColors,
    typography: defaultTypography,
    visualization: defaultVisualization,
    effects: defaultEffects,
    tokens: defaultTokens,
    surfaces: defaultSurfaces,
    ui: defaultUI

} as const satisfies StylePack;
