import {expect, test, type Locator} from "@playwright/test";
import {assertNoPageFailures, gotoStudio, recordPageFailures} from "./studioTestHarness";

test("focus remains visible in supported themes and viewport keys move and inspect safely", async ({page}) => {
  const failures = recordPageFailures(page);
  await gotoStudio(page, failures);

  const probe = page.getByRole("button", {name: "probe", exact: true});
  await assertKeyboardFocusVisible(probe);

  await page.getByRole("combobox", {name: "Style Pack"}).selectOption("livermore");
  await assertKeyboardFocusVisible(probe);
  await page.reload();
  await expect(page.locator(".viewport-region canvas")).toBeVisible();

  const viewport = page.getByRole("region", {name: "Transport viewport"});
  const focusViewport = page.getByRole("button", {name: "Focus viewport"});
  await page.keyboard.press("Tab");
  await expect(focusViewport).toBeFocused();
  await focusViewport.press("Enter");
  await expect(viewport).toBeFocused();
  await assertVisibleOutline(viewport);
  await expect(viewport).toHaveAccessibleDescription(/W\/A\/S\/D move.*F focus selection.*Home reset/);

  const initialSequence = Number(await viewport.getAttribute("data-camera-sequence"));
  const initialPosition = await viewport.getAttribute("data-camera-position");
  await viewport.press("w");
  await expect(viewport).toHaveAttribute("data-camera-command", "forward");
  await expect(viewport).toHaveAttribute("data-camera-sequence", String(initialSequence + 1));
  await expect.poll(() => viewport.getAttribute("data-camera-position")).not.toBe(initialPosition);
  await expect(page.getByText("Camera moved forward.", {exact: true})).toBeVisible();

  await viewport.press("f");
  await expect(viewport).toHaveAttribute("data-camera-command", "inspect");
  await expect.poll(() => viewport.getAttribute("data-camera-position")).toBe("6.000,4.000,7.000");
  await expect(viewport).toHaveAttribute("data-camera-target", "0.000,0.000,0.000");
  await expect(page.getByText("Focused Shield Slab.", {exact: true})).toBeVisible();

  const sourceControl = page.getByRole("button", {name: "Select Photon Beam in viewport"});
  await sourceControl.focus();
  await sourceControl.press("f");
  await expect(page.getByText("Focused Photon Beam.", {exact: true})).toBeVisible();
  await expect(page.locator(".viewport-hud.top-left")).toContainText("Photon Beam");
  await expect.poll(() => viewport.getAttribute("data-camera-target")).toBe("-8.000,0.000,0.000");

  await invokeFocusShortcut(focusViewport);
  await viewport.press("Home");
  await expect(viewport).toHaveAttribute("data-camera-command", "reset");
  await expect.poll(() => viewport.getAttribute("data-camera-position")).toBe(initialPosition);
  await expect(viewport).toHaveAttribute("data-camera-target", "0.000,0.000,0.000");
  await expect(page.getByText("Camera reset to the default view.", {exact: true})).toBeVisible();

  await page.getByRole("treeitem", {name: "Detector Plane, tally"}).click();
  await page.getByRole("checkbox", {name: "Tallies"}).uncheck();
  const sequenceBeforeHiddenTally = await viewport.getAttribute("data-camera-sequence");
  await invokeFocusShortcut(focusViewport);
  await viewport.press("f");
  await expect(viewport).toHaveAttribute("data-camera-sequence", sequenceBeforeHiddenTally!);
  await expect(page.getByText("Enable Tallies before focusing a tally entity.", {exact: true})).toBeVisible();
  await page.getByRole("checkbox", {name: "Tallies"}).check();

  const sequenceBeforeInput = await viewport.getAttribute("data-camera-sequence");
  const search = page.getByPlaceholder("Name, kind, tag, description");
  await search.focus();
  await search.press("w");
  await expect(search).toHaveValue("w");
  await expect(viewport).toHaveAttribute("data-camera-sequence", sequenceBeforeInput!);

  await invokeFocusShortcut(focusViewport);
  await viewport.press("x");
  await expect(viewport).toHaveAttribute("data-camera-sequence", sequenceBeforeInput!);

  await page.getByRole("button", {name: "Reset Style Pack"}).click();
  await assertNoPageFailures(failures);
});

async function assertKeyboardFocusVisible(control: Locator) {
  await control.focus();
  await control.press("Tab");
  await control.focus();
  await assertVisibleOutline(control);
}

async function invokeFocusShortcut(shortcut: Locator) {
  await shortcut.focus();
  await shortcut.press("Enter");
}

async function assertVisibleOutline(control: Locator) {
  await expect(control).toBeFocused();
  const outline = await control.evaluate((element) => {
    const style = getComputedStyle(element);
    return {style: style.outlineStyle, width: Number.parseFloat(style.outlineWidth), color: style.outlineColor};
  });
  expect(outline.style).not.toBe("none");
  expect(outline.width).toBeGreaterThanOrEqual(2);
  expect(outline.color).not.toBe("rgba(0, 0, 0, 0)");
}
