import {StylePack} from "../../../StylePack";
import {livermoreColors} from "./colors";
import {livermoreEffects} from "./effects";
import {livermoreTokens} from "./tokens";
import {livermoreTypography} from "./typography";
import {livermoreVisualization} from "./visualization";
import {livermoreSurfaces} from "./surfaces";
import {livermoreUI} from "./ui";

export const livermorePack: StylePack = {
    id: "livermore",
    displayName: "Lawrence Livermore",
    description: "Dark, precise, blue-cyan scientific visualization theme inspired by HPC diagnostics and exascale simulation environments.",
    colors: livermoreColors,
    typography: livermoreTypography,
    visualization: livermoreVisualization,
    effects: livermoreEffects,
    tokens: livermoreTokens,
    surfaces: livermoreSurfaces,
    ui: livermoreUI

} as const satisfies StylePack;