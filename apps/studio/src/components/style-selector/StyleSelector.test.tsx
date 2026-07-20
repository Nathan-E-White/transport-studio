import {fireEvent, render, screen} from "@testing-library/react";
import {beforeEach, describe, expect, it} from "vitest";
import {defaultPack, livermorePack, stylePacks} from "@transport/frontend/styles/packs";
import {StyleSelectorBoundary} from "./StyleSelectorBoundary";
import {
  STYLE_PACK_STORAGE_KEY,
  StyleSelectorProvider,
  type StylePackStorage,
} from "./StyleSelectorProvider";

function createTestStorage(): StylePackStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

function renderStyleSelector(storage: StylePackStorage) {
  return render(
    <StyleSelectorProvider defaultPackID={defaultPack.id} packs={stylePacks} storage={storage}>
      <StyleSelectorBoundary/>
    </StyleSelectorProvider>,
  );
}

describe("StyleSelector", () => {
  let storage: StylePackStorage;

  beforeEach(() => {
    storage = createTestStorage();
  });

  it("restores the selected pack after the provider remounts", () => {
    const firstRender = renderStyleSelector(storage);

    fireEvent.change(screen.getByLabelText("Style Pack"), {target: {value: livermorePack.id}});
    expect(screen.getByLabelText("Style Pack")).toHaveValue(livermorePack.id);

    firstRender.unmount();
    renderStyleSelector(storage);

    expect(screen.getByLabelText("Style Pack")).toHaveValue(livermorePack.id);
  });

  it("resets the active and stored pack to the documented default", () => {
    renderStyleSelector(storage);
    fireEvent.change(screen.getByLabelText("Style Pack"), {target: {value: livermorePack.id}});

    fireEvent.click(screen.getByRole("button", {name: "Reset Style Pack"}));

    expect(screen.getByLabelText("Style Pack")).toHaveValue(defaultPack.id);
    expect(storage.getItem(STYLE_PACK_STORAGE_KEY)).toBe(defaultPack.id);
  });

  it("replaces an invalid stored pack with the documented default", () => {
    storage.setItem(STYLE_PACK_STORAGE_KEY, "removed-pack");

    renderStyleSelector(storage);

    expect(screen.getByLabelText("Style Pack")).toHaveValue(defaultPack.id);
    expect(storage.getItem(STYLE_PACK_STORAGE_KEY)).toBe(defaultPack.id);
  });
});
