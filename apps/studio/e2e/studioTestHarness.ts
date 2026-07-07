import {expect, type Page} from "@playwright/test";

export interface PageFailureRecorder {
  readonly consoleErrors: string[];
  readonly pageErrors: string[];
}

export function recordPageFailures(page: Page): PageFailureRecorder {
  const recorder: PageFailureRecorder = {
    consoleErrors: [],
    pageErrors: [],
  };

  page.on("console", (message) => {
    if (message.type() === "error") {
      recorder.consoleErrors.push(message.text());
    }
  });

  page.on("pageerror", (error) => {
    recorder.pageErrors.push(error.message);
  });

  return recorder;
}

export async function gotoStudio(page: Page, failures: PageFailureRecorder): Promise<void> {
  await page.goto("/");
  await assertStableStudioShell(page, failures);
}

export async function assertStableStudioShell(
  page: Page,
  failures: PageFailureRecorder,
): Promise<void> {
  await expect(page.getByText("Transport Studio")).toBeVisible();
  await expect(page.getByRole("region", {name: "Project tree"})).toBeVisible();
  await expect(page.locator(".viewport-region canvas")).toBeVisible();
  await expect(page.getByRole("heading", {name: "Inspector"})).toBeVisible();
  await expect(page.locator(".run-dock")).toBeVisible();
  await expect(page.locator(".viewport-hud.top-left")).toContainText(/\d+ sampled tracks/);

  expect(failures.pageErrors, "unexpected page errors").toEqual([]);
  expect(failures.consoleErrors, "unexpected browser console errors").toEqual([]);
}

export function entityRow(page: Page, name: string, kind?: string) {
  return page.getByRole("treeitem", {
    name: kind ? `${name}, ${kind}` : new RegExp(`^${escapeRegExp(name)},`),
  });
}

export async function clickRowAction(
  page: Page,
  entityName: string,
  actionName: string | RegExp,
): Promise<void> {
  await entityRow(page, entityName).getByRole("button", {name: actionName}).click();
}

export async function assertNoPageFailures(failures: PageFailureRecorder): Promise<void> {
  expect(failures.pageErrors, "unexpected page errors").toEqual([]);
  expect(failures.consoleErrors, "unexpected browser console errors").toEqual([]);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
