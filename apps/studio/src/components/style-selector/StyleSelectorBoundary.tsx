

import {StyleSelector} from "./StyleSelector";
import {useStyleSelectorContext} from "./StyleSelectorContext";

export function StyleSelectorBoundary() {
    const {activePackID, packs, setActivePackID} = useStyleSelectorContext();

    return <StyleSelector activePackID={activePackID} packs={packs} onChange={setActivePackID} />;
}
