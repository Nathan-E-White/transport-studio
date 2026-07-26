import {expect, test} from "@playwright/test";
import {assertNoPageFailures, gotoStudio, recordPageFailures} from "./studioTestHarness";

test("keeps the Inspector usable while transitioning between narrow and desktop layouts", async ({page}) => {
  await page.setViewportSize({width: 1000, height: 900});
  const failures = recordPageFailures(page);
  await gotoStudio(page, failures);

  const inspectorToggle = page.getByRole("button", {name: "Inspector", exact: true});
  const inspectorPanel = page.locator("#studio-inspector-panel");
  const positionX = page.getByLabel("Position X");
  const runDock = page.locator("#studio-run-dock-panel");

  await page.getByRole("treeitem", {name: "Shield Slab, geometry"}).click();
  await expect(inspectorPanel).toBeVisible();
  await expect(inspectorPanel.getByRole("heading", {name: "Shield Slab"})).toBeVisible();
  await expect(runDock).toBeVisible();

  await positionX.fill("");
  await page.getByRole("button", {name: "Apply Inspector Changes"}).click();
  await expect(page.getByRole("alert", {name: "Inspector edit rejected"})).toBeVisible();

  await inspectorToggle.click();
  await expect(inspectorToggle).toHaveAttribute("aria-expanded", "false");
  await expect(inspectorPanel).toBeHidden();
  await inspectorToggle.click();
  await expect(inspectorToggle).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("alert", {name: "Inspector edit rejected"})).toBeVisible();

  await positionX.focus();
  await inspectorPanel.evaluate((panel) => { panel.scrollTop = 120; });
  await page.setViewportSize({width: 1280, height: 900});
  await expect(positionX).toBeFocused();
  await expect(inspectorPanel.getByRole("heading", {name: "Shield Slab"})).toBeVisible();
  await expect(inspectorPanel.evaluate((panel) => panel.scrollTop)).resolves.toBeGreaterThan(100);

  await page.setViewportSize({width: 1000, height: 900});
  await expect(inspectorPanel).toBeVisible();
  await expect(runDock).toBeVisible();
  await expect(inspectorPanel.evaluate((panel) => panel.scrollTop)).resolves.toBeGreaterThan(100);

  await assertNoPageFailures(failures);
});
