

import {StyleSelector} from "./StyleSelector";
import {useStyleSelectorContext} from "./StyleSelectorContext";

export function StyleSelectorBoundary() {
    const {activePackID, packs, setActivePackID, resetActivePack} = useStyleSelectorContext();

    return <StyleSelector activePackID={activePackID} packs={packs} onChange={setActivePackID} onReset={resetActivePack} />;
}
