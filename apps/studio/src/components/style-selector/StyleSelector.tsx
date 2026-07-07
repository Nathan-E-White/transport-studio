import type {ChangeEvent} from "react";
import type {StylePackID} from "@transport/frontend";
import type {StyleSelectorProps} from "./StyleSelectorProps";

export function StyleSelector({
                                  activePackID,
                                  packs,
                                  onChange,
                              }: StyleSelectorProps) {
    function handleChange(event: ChangeEvent<HTMLSelectElement>) {
        onChange(event.target.value as StylePackID);
    }

    return (
        <label className="style-pack-selector">
            <span className="style-pack-selector__label">Style Pack</span>

            <select
                className="style-pack-selector__select"
                value={activePackID}
                onChange={handleChange}
            >
                {packs.map((pack) => (
                    <option key={pack.id} value={pack.id}>
                        {pack.displayName}
                    </option>
                ))}
            </select>
        </label>
    );
}
