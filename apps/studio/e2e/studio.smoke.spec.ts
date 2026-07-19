import {expect, test} from "@playwright/test";
import {
  assertNoPageFailures,
  assertStableStudioShell,
  gotoStudio,
  recordPageFailures,
} from "./studioTestHarness";

test("opens the studio shell and runs the main browser flows", async ({page}) => {
  const failures = recordPageFailures(page);

  await gotoStudio(page, failures);

  await expect(page.getByRole("treeitem", {name: "Shield Slab, geometry"})).toBeVisible();
  await expect(page.getByRole("treeitem", {name: "Toy Shield, material"})).toBeVisible();
  await expect(page.getByRole("treeitem", {name: "Photon Beam, source"})).toBeVisible();
  await expect(page.getByRole("treeitem", {name: "Detector Plane, tally"})).toBeVisible();

  await page.getByRole("combobox", {name: "Style Pack"}).selectOption("livermore");
  await page.reload();
  await expect(page.getByRole("combobox", {name: "Style Pack"})).toHaveValue("livermore");
  await page.getByRole("button", {name: "Reset Style Pack"}).click();
  await expect(page.getByRole("combobox", {name: "Style Pack"})).toHaveValue("default");

  await expect(page.locator(".axis-label")).toHaveCount(3);
  await page.getByRole("checkbox", {name: "Axes"}).uncheck();
  await expect(page.locator(".axis-label")).toHaveCount(0);
  await page.getByRole("checkbox", {name: "Axes"}).check();
  await expect(page.locator(".axis-label")).toHaveCount(3);

  const designMode = page.getByRole("button", {name: "design"});
  const probeMode = page.getByRole("button", {name: "probe"});
  await expect(designMode).toHaveAttribute("aria-pressed", "true");
  await probeMode.focus();
  await probeMode.press("Enter");
  await expect(probeMode).toBeFocused();
  await expect(probeMode).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".viewport-hud.top-left")).toContainText("PROBE MODE");

  await page.getByRole("button", {name: "analyze"}).click();
  await expect(page.locator(".viewport-hud.top-left")).toContainText("ANALYZE MODE");

  await page.getByRole("button", {name: "design"}).click();
  await expect(page.locator(".viewport-hud.top-left")).toContainText("DESIGN MODE");

  const runTab = page.getByRole("tab", {name: "run"});
  await expect(page.getByRole("tablist", {name: "Run details"})).toBeVisible();
  await expect(runTab).toHaveAttribute("aria-selected", "true");
  await expect(runTab).toHaveAttribute("aria-controls", "bottom-dock-panel-run");
  await expect(page.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", "bottom-dock-tab-run");
  await runTab.focus();
  await runTab.press("ArrowRight");
  const talliesTab = page.getByRole("tab", {name: "tallies"});
  await expect(talliesTab).toBeFocused();
  await expect(talliesTab).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", {name: "tracks"}).click();
  await expect(page.getByRole("tab", {name: "tracks"})).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", {name: "tracks"}).press("Home");
  await expect(runTab).toBeFocused();
  await expect(runTab).toHaveAttribute("aria-selected", "true");

  await page.getByRole("button", {name: /Run Toy Photons/}).click();
  await expect(page.locator(".viewport-hud.top-left")).toContainText(/64 sampled tracks/);
  await expect(page.locator(".run-dock")).toContainText("visual-ts");

  await page.getByRole("button", {name: "Clear"}).click();
  await expect(page.locator(".viewport-hud.top-left")).toContainText("0 sampled tracks");

  await page.getByRole("button", {name: "Run Native Rust"}).click();
  await expect(page.locator(".run-dock")).toContainText(
    "material.toy-coefficients.lossy: Material \"Toy Shield\" toy transport coefficients are not part of the compiled material contract and were omitted.",
  );
  await expect(page.locator(".run-dock")).toContainText(
    "native.bridge.unavailable: Native Rust photon backend bridge is not available in this runtime.",
  );

  await assertStableStudioShell(page, failures);
  await assertNoPageFailures(failures);
});
