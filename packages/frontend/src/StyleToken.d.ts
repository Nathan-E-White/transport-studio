import type {StyleTokenValue} from "./StyleTokenValue";

export type StyleTokenName = `--${string}`;
export type StyleTokens = Record<StyleTokenName, StyleTokenValue>;
