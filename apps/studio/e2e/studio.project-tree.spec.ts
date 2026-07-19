import {expect, test} from "@playwright/test";
import {
  assertNoPageFailures,
  clickRowAction,
  entityRow,
  gotoStudio,
  recordPageFailures,
} from "./studioTestHarness";

test("project tree drives real editor CRUD state", async ({page}) => {
  const failures = recordPageFailures(page);

  await gotoStudio(page, failures);

  await entityRow(page, "Shield Slab", "geometry").click();
  await expect(page.getByRole("heading", {name: "Shield Slab"})).toBeVisible();
  await expect(page.getByLabel("Rotation value")).toContainText("0.00, 0.00, 0.00");

  await clickRowAction(page, "Shield Slab", "Edit entity metadata");
  await page.getByLabel("Name").fill("Shield Plate");
  await page.getByLabel("Description").fill("Renamed through the browser test");
  await page.getByLabel("Tags").fill("demo, browser");
  await page.getByRole("button", {name: "Save"}).click();

  await expect(entityRow(page, "Shield Plate", "geometry")).toBeVisible();
  await expect(page.getByRole("heading", {name: "Shield Plate"})).toBeVisible();

  await clickRowAction(page, "Shield Plate", "Hide this entity in the viewport");
  await expect(entityRow(page, "Shield Plate").locator('[data-badge-kind="hidden"]')).toBeVisible();

  await clickRowAction(page, "Shield Plate", "Show this entity in the viewport");
  await expect(entityRow(page, "Shield Plate").locator('[data-badge-kind="hidden"]')).toHaveCount(0);

  await clickRowAction(page, "Shield Plate", "Lock this entity against editing");
  await expect(entityRow(page, "Shield Plate").locator('[data-badge-kind="locked"]')).toBeVisible();
  await expect(
    entityRow(page, "Shield Plate").getByRole("button", {name: "Locked entities cannot be edited"}),
  ).toBeDisabled();

  await clickRowAction(page, "Shield Plate", "Unlock this entity for editing");
  await expect(entityRow(page, "Shield Plate").locator('[data-badge-kind="locked"]')).toHaveCount(0);

  await clickRowAction(page, "Shield Plate", "Duplicate this entity");
  await expect(entityRow(page, "Shield Plate Copy", "geometry")).toBeVisible();
  await entityRow(page, "Shield Plate Copy", "geometry").click();
  await expect(page.getByRole("heading", {name: "Shield Plate Copy"})).toBeVisible();

  await page.getByRole("button", {name: "+ Source"}).click();
  await expect(entityRow(page, "New Source", "source")).toBeVisible();
  await entityRow(page, "New Source", "source").click();
  await expect(page.getByRole("heading", {name: "New Source"})).toBeVisible();

  await clickRowAction(page, "New Source", "Delete this entity");
  await expect(entityRow(page, "New Source", "source")).toHaveCount(0);

  await page.getByRole("button", {name: "+ Geometry"}).click();
  await expect(entityRow(page, "New Geometry", "geometry").locator('[data-badge-kind="missing-material"]')).toBeVisible();
  await clickRowAction(page, "New Geometry", "Delete this entity");

  await page.getByRole("button", {name: /Run Toy Photons/}).click();
  await expect(page.locator(".viewport-hud.top-left")).toContainText(/64 sampled tracks/);

  await assertNoPageFailures(failures);
});
