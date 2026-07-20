import {describe, expect, it} from "vitest";
import {resolveViewportKeyboardCommand} from "./viewportKeyboard";

function keyEvent(key: string, overrides: Partial<KeyboardEvent> = {}): KeyboardEvent {
  return {key, altKey: false, ctrlKey: false, metaKey: false, isComposing: false, ...overrides} as KeyboardEvent;
}

describe("viewport keyboard commands", () => {
  it.each([
    ["w", "forward"], ["s", "backward"], ["a", "left"], ["d", "right"],
    ["q", "down"], ["e", "up"], ["f", "inspect"], ["Home", "reset"],
  ] as const)("maps %s to %s when the viewport itself owns focus", (key, command) => {
    const viewport = document.createElement("section");
    expect(resolveViewportKeyboardCommand(keyEvent(key), viewport, viewport)).toBe(command);
  });

  it("ignores text editing, child controls, composing input, modifiers, and unrelated keys", () => {
    const viewport = document.createElement("section");
    const input = document.createElement("input");
    viewport.append(input);

    expect(resolveViewportKeyboardCommand(keyEvent("w"), input, viewport)).toBeNull();
    expect(resolveViewportKeyboardCommand(keyEvent("w", {isComposing: true}), viewport, viewport)).toBeNull();
    expect(resolveViewportKeyboardCommand(keyEvent("w", {ctrlKey: true}), viewport, viewport)).toBeNull();
    expect(resolveViewportKeyboardCommand(keyEvent("Enter"), viewport, viewport)).toBeNull();
  });

  it("allows the inspection command, but not movement, from an accessible viewport entity control", () => {
    const viewport = document.createElement("section");
    const entityControl = document.createElement("button");
    entityControl.dataset.viewportEntityPick = "true";
    viewport.append(entityControl);

    expect(resolveViewportKeyboardCommand(keyEvent("f"), entityControl, viewport)).toBe("inspect");
    expect(resolveViewportKeyboardCommand(keyEvent("w"), entityControl, viewport)).toBeNull();
  });
});
