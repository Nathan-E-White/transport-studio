import type {StylePack, StylePackID} from "@transport/frontend";

export interface StyleSelectorProps {
    activePackID: StylePackID;
    packs: readonly StylePack[];
    onChange: (packID: StylePackID) => void;
    onReset: () => void;
}
