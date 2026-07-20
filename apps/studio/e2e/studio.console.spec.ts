import {expect, test} from "@playwright/test";
import {assertNoPageFailures, gotoStudio, recordPageFailures} from "./studioTestHarness";

test("Console presents the ordered Run Session protocol stream", async ({page}) => {
  const failures = recordPageFailures(page);
  await gotoStudio(page, failures);

  await page.getByRole("tab", {name: "console"}).click();
  await expect(page.getByRole("tabpanel")).toContainText("Console disconnected: no Run Session is selected.");
  await expect(page.getByRole("tabpanel")).not.toContainText("transport-worker://");

  await page.getByRole("button", {name: /Run Toy Photons/}).click();
  await expect(page.locator(".viewport-hud.top-left")).toContainText(/64 sampled tracks/);
  await page.getByRole("tab", {name: "console"}).click();

  const events = page.getByRole("list", {name: "Run Session console events"}).getByRole("listitem");
  await expect(events).toHaveCount(5);
  await expect(events.nth(0)).toContainText("#1");
  await expect(events.nth(0)).toContainText("problemAccepted");
  await expect(events.nth(1)).toContainText("#2");
  await expect(events.nth(1)).toContainText("runStarted");
  await expect(events.nth(2)).toContainText("runProgress");
  await expect(events.nth(3)).toContainText("trackSamples");
  await expect(events.nth(4)).toContainText("runCompleted");
  await expect(events.nth(4)).toContainText("terminal");
  await expect(events.nth(4)).toContainText("visual-ts prototype");
  await expect(events.nth(4).locator("time")).toHaveAttribute("datetime", /T.*Z$/);

  await assertNoPageFailures(failures);
});
