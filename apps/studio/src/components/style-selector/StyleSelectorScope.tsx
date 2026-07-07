

import type {PropsWithChildren} from "react";
import type {StylePack, StylePackID} from "@transport/frontend";
import {StyleSelectorProvider} from "./StyleSelectorProvider";

export interface StyleSelectorScopeProps extends PropsWithChildren {
    defaultPackID: StylePackID;
    packs: readonly StylePack[];
}

export function StyleSelectorScope({
    children,
    defaultPackID,
    packs,
}: StyleSelectorScopeProps) {
    return (
        <StyleSelectorProvider defaultPackID={defaultPackID} packs={packs}>
            {children}
        </StyleSelectorProvider>
    );
}
