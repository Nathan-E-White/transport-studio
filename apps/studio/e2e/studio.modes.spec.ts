import {expect, test} from "@playwright/test";
import {assertNoPageFailures, clickRowAction, entityRow, gotoStudio, recordPageFailures} from "./studioTestHarness";

test("every editor mode exposes and enforces its interaction slice", async ({page}) => {
  const failures = recordPageFailures(page);
  await gotoStudio(page, failures);

  const hud = page.locator(".viewport-hud.top-left");
  const apply = page.getByRole("button", {name: "Apply Inspector Changes"});
  const createGeometry = page.getByRole("button", {name: "+ Geometry"});

  await expect(hud).toContainText("DESIGN MODE");
  await expect(hud).toContainText("Modeled geometry and editable scene helpers");
  await expect(apply).toBeEnabled();
  await expect(createGeometry).toBeEnabled();
  await page.getByRole("button", {name: "Select Photon Beam in viewport"}).click();
  await expect(page.getByRole("heading", {name: "Photon Beam"})).toBeVisible();
  await page.getByLabel("Position X").fill("-3.25");
  await apply.click();
  await expect(page.getByLabel("Position value")).toContainText("-3.25");

  await clickRowAction(page, "Shield Slab", "Edit entity metadata");
  await page.getByLabel("Name").fill("Unsaved mode transition");

  await page.getByRole("button", {name: "probe"}).click();
  await expect(hud).toContainText("PROBE MODE");
  await expect(hud).toContainText("Sources and tally regions");
  await expect(entityRow(page, "Toy Shield", "material")).toHaveAttribute("aria-disabled", "true");
  await expect(apply).toBeDisabled();
  await expect(createGeometry).toBeDisabled();
  await expect(page.getByLabel("Name")).toHaveCount(0);
  await expect(page.getByText("Probe mode is read-only.", {exact: false}).first()).toBeVisible();
  await expect(page.getByRole("button", {name: "Project settings"})).toHaveAttribute("title", /Probe mode is read-only/);

  await page.getByRole("button", {name: "run", exact: true}).click();
  await expect(hud).toContainText("RUN MODE");
  await expect(hud).toContainText("Source launch and tally entities");
  await expect(entityRow(page, "Shield Slab", "geometry")).toHaveAttribute("aria-disabled", "true");
  await expect(page.getByRole("button", {name: "Select Shield Slab in viewport"})).toBeDisabled();
  await entityRow(page, "Photon Beam", "source").click();
  await expect(hud).toContainText("Photon Beam");

  await page.getByRole("button", {name: "analyze"}).click();
  await expect(hud).toContainText("ANALYZE MODE");
  await expect(hud).toContainText("Statistical tally entities");
  await expect(hud).toContainText("No entity selected");
  await expect(entityRow(page, "Photon Beam", "source")).toHaveAttribute("aria-disabled", "true");
  await entityRow(page, "Detector Plane", "tally").click();
  await expect(hud).toContainText("Detector Plane");

  await page.getByRole("button", {name: "debug"}).click();
  await expect(hud).toContainText("DEBUG MODE");
  await expect(hud).toContainText("Geometry, source, and tally wireframes");
  await expect(entityRow(page, "Toy Shield", "material")).toHaveAttribute("aria-disabled", "false");
  await expect(apply).toBeDisabled();

  await assertNoPageFailures(failures);
});
