

import {createContext, useContext} from "react";
import type {StylePack, StylePackID} from "@transport/frontend";

export interface StyleSelectorContextValue {
    activePack: StylePack;
    activePackID: StylePackID;
    packs: readonly StylePack[];
    setActivePackID: (packID: StylePackID) => void;
}

export const StyleSelectorContext = createContext<StyleSelectorContextValue | undefined>(undefined);

export function useStyleSelectorContext(): StyleSelectorContextValue {
    const context = useContext(StyleSelectorContext);

    if (context === undefined) {
        throw new Error("useStyleSelectorContext must be used inside a StyleSelectorProvider.");
    }

    return context;
}
