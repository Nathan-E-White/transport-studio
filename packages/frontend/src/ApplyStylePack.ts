import type {StylePack} from "./StylePack";
import type {StyleTokenName} from "./StyleToken";

export function ApplyStylePack(pack: StylePack): void {
    const root: HTMLElement = document.documentElement;

    Object.keys(pack.tokens).forEach((tokenName) => {
        const styleTokenName = tokenName as StyleTokenName;
        const tokenValue = pack.tokens[styleTokenName];

        root.style.setProperty(styleTokenName, String(tokenValue));
    });
}