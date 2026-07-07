import {useEffect, useMemo, useReducer, type PropsWithChildren} from "react";
import {ApplyStylePack, type StylePack, type StylePackID} from "@transport/frontend";
import {StyleSelectorContext} from "./StyleSelectorContext";
import type {StyleSelectorAction} from "./StyleSelectorActionModels";
import type {StyleSelectorState} from "./StyleSelectorModels";

interface StyleSelectorProviderProps extends PropsWithChildren {
    defaultPackID: StylePackID;
    packs: readonly StylePack[];
}

function getActivePack(packs: readonly StylePack[], activePackID: StylePackID): StylePack {
    const activePack = packs.find((pack) => pack.id === activePackID);

    if (activePack === undefined) {
        throw new Error(`Style pack not found: ${activePackID}`);
    }

    return activePack;
}

function createInitialState(defaultPackID: StylePackID): StyleSelectorState {
    return {
        activePackID: defaultPackID,
    };
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
                                      }: StyleSelectorProviderProps) {
    const [state, dispatch] = useReducer(
        (currentState: StyleSelectorState, action: StyleSelectorAction) =>
            styleSelectorReducer(currentState, action, defaultPackID),
        defaultPackID,
        createInitialState,
    );

    const activePack = useMemo(
        () => getActivePack(packs, state.activePackID),
        [packs, state.activePackID],
    );

    useEffect(() => {
        ApplyStylePack(activePack);
    }, [activePack]);

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
        }),
        [activePack, packs, state.activePackID],
    );

    return <StyleSelectorContext.Provider value={value}>{children}</StyleSelectorContext.Provider>;
}
