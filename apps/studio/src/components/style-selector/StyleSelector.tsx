import type {ChangeEvent} from "react";
import type {StylePackID} from "@transport/frontend";
import type {StyleSelectorProps} from "./StyleSelectorProps";

export function StyleSelector({
                                  activePackID,
                                  packs,
                                  onChange,
                                  onReset,
                              }: StyleSelectorProps) {
    function handleChange(event: ChangeEvent<HTMLSelectElement>) {
        onChange(event.target.value as StylePackID);
    }

    return (
        <div className="style-pack-controls">
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
            <button type="button" className="style-pack-selector__reset" aria-label="Reset Style Pack" onClick={onReset}>
                Reset
            </button>
        </div>
    );
}
