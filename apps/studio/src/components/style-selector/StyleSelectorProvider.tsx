import {useEffect, useMemo, useReducer, type PropsWithChildren} from "react";
import {ApplyStylePack, type StylePack, type StylePackID} from "@transport/frontend";
import {StyleSelectorContext} from "./StyleSelectorContext";
import type {StyleSelectorAction} from "./StyleSelectorActionModels";
import type {StyleSelectorState} from "./StyleSelectorModels";

interface StyleSelectorProviderProps extends PropsWithChildren {
    defaultPackID: StylePackID;
    packs: readonly StylePack[];
    storage?: StylePackStorage | null;
}

export interface StylePackStorage {
    readonly getItem: (key: string) => string | null;
    readonly setItem: (key: string, value: string) => void;
}

export const STYLE_PACK_STORAGE_KEY = "transport-studio.style-pack";

function getActivePack(packs: readonly StylePack[], activePackID: StylePackID): StylePack {
    const activePack = packs.find((pack) => pack.id === activePackID);

    if (activePack === undefined) {
        throw new Error(`Style pack not found: ${activePackID}`);
    }

    return activePack;
}

function createInitialState({
                                defaultPackID,
                                packs,
                                storage,
                            }: {
    readonly defaultPackID: StylePackID;
    readonly packs: readonly StylePack[];
    readonly storage: StylePackStorage | null;
}): StyleSelectorState {
    const storedPackID = readStoredPackID(storage);
    return {
        activePackID: storedPackID !== null && packs.some((pack) => pack.id === storedPackID)
            ? storedPackID
            : defaultPackID,
    };
}

function readStoredPackID(storage: StylePackStorage | null): StylePackID | null {
    try {
        return storage?.getItem(STYLE_PACK_STORAGE_KEY) ?? null;
    } catch {
        return null;
    }
}

function getBrowserStorage(): StylePackStorage | null {
    try {
        return typeof window === "undefined" ? null : window.localStorage;
    } catch {
        return null;
    }
}

function styleSelectorReducer(
    state: StyleSelectorState,
    action: StyleSelectorAction,
    defaultPackID: StylePackID,
): StyleSelectorState {
    switch (action.type) {
        case "set-active-pack":
            return {activePackID: action.packID};

        case "reset-active-pack":
            return {activePackID: defaultPackID};

        default:
            return state;
    }
}

export function StyleSelectorProvider({
                                          children,
                                          defaultPackID,
                                          packs,
                                          storage = getBrowserStorage(),
                                      }: StyleSelectorProviderProps) {
    const [state, dispatch] = useReducer(
        (currentState: StyleSelectorState, action: StyleSelectorAction) =>
            styleSelectorReducer(currentState, action, defaultPackID),
        {defaultPackID, packs, storage},
        createInitialState,
    );

    const activePack = useMemo(
        () => getActivePack(packs, state.activePackID),
        [packs, state.activePackID],
    );

    useEffect(() => {
        ApplyStylePack(activePack);
    }, [activePack]);

    useEffect(() => {
        try {
            storage?.setItem(STYLE_PACK_STORAGE_KEY, state.activePackID);
        } catch {
            // Storage is optional; the selected pack still applies for this session.
        }
    }, [state.activePackID, storage]);

    const value = useMemo(
        () => ({
            activePack,
            activePackID: state.activePackID,
            packs,
            setActivePackID: (packID: StylePackID) =>
                dispatch({
                    type: "set-active-pack",
                    packID,
                }),
            resetActivePack: () => dispatch({type: "reset-active-pack"}),
        }),
        [activePack, packs, state.activePackID],
    );

    return <StyleSelectorContext.Provider value={value}>{children}</StyleSelectorContext.Provider>;
}
