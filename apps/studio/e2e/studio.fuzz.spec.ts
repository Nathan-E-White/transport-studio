import {expect, test, type Page} from "@playwright/test";
import fc, {type AsyncCommand} from "fast-check";
import {
  assertStableStudioShell,
  clickRowAction,
  entityRow,
  gotoStudio,
  recordPageFailures,
  type PageFailureRecorder,
} from "./studioTestHarness";

type EntityKind = "geometry" | "material" | "source" | "tally";

interface ModelEntity {
  readonly kind: EntityKind;
  visible: boolean;
  locked: boolean;
}

interface StudioModel {
  entities: Record<string, ModelEntity>;
  selectedEntity?: string;
}

interface StudioReal {
  readonly page: Page;
  readonly failures: PageFailureRecorder;
}

const initialEntities: Record<string, ModelEntity> = {
  "Toy Shield": {kind: "material", visible: true, locked: false},
  "Shield Slab": {kind: "geometry", visible: true, locked: false},
  "Photon Beam": {kind: "source", visible: true, locked: false},
  "Detector Plane": {kind: "tally", visible: true, locked: false},
};

const entityCandidates = [
  "Toy Shield",
  "Shield Slab",
  "Photon Beam",
  "Detector Plane",
  "New Geometry",
  "New Material",
  "New Source",
  "New Tally",
] as const;

test("generated editor command sequences keep the studio coherent", async ({page}, testInfo) => {
  const failures = recordPageFailures(page);
  const seed = readIntegerEnv("FUZZ_SEED", 424242);
  const numRuns = readIntegerEnv("FUZZ_RUNS", 4);
  const maxCommands = readIntegerEnv("FUZZ_MAX_COMMANDS", 8);
  const path = process.env.FUZZ_PATH;

  testInfo.annotations.push({type: "fuzz-seed", description: String(seed)});

  const commandArbitrary = fc.commands(buildCommands(), {maxCommands});

  try {
    await fc.assert(
      fc.asyncProperty(commandArbitrary, async (commands) => {
        await page.goto("/");
        await assertStableStudioShell(page, failures);
        await fc.asyncModelRun(
          () => ({
            model: createInitialModel(),
            real: {page, failures},
          }),
          commands,
        );
      }),
      {
        seed,
        path,
        numRuns,
        endOnFailure: true,
      },
    );
  } catch (error) {
    throw new Error(
      [
        `Studio fuzz failed. Replay with FUZZ_SEED=${seed}${path ? ` FUZZ_PATH=${path}` : ""}.`,
        error instanceof Error ? error.message : String(error),
      ].join("\n"),
    );
  }
});

function buildCommands(): fc.Arbitrary<AsyncCommand<StudioModel, StudioReal>>[] {
  return [
    ...(["design", "probe", "run", "analyze", "debug"] as const).map((mode) =>
      fc.constant(command(`switchMode:${mode}`, () => true, async (_model, real) => {
        await real.page
          .getByRole("navigation", {name: "Editor modes"})
          .getByRole("button", {name: mode})
          .click();
        await expect(real.page.locator(".viewport-hud.top-left")).toContainText(`${mode.toUpperCase()} MODE`);
      })),
    ),
    ...(["Tracks", "Tallies", "Diagnostics"] as const).map((label) =>
      fc.constant(command(`toggleOverlay:${label}`, () => true, async (_model, real) => {
        await real.page.getByRole("checkbox", {name: label}).click();
      })),
    ),
    fc.constant(command("runToyPhotons", () => true, async (_model, real) => {
      await real.page.getByRole("button", {name: /Run Toy Photons/}).click();
      await expect(real.page.locator(".viewport-hud.top-left")).toContainText(/\d+ sampled tracks/);
    })),
    fc.constant(command("clearRun", () => true, async (_model, real) => {
      await real.page.getByRole("button", {name: "Clear"}).click();
      await expect(real.page.locator(".viewport-hud.top-left")).toContainText("0 sampled tracks");
    })),
    ...entityCandidates.map((name) =>
      fc.constant(command(`select:${name}`, (model) => Boolean(model.entities[name]), async (model, real) => {
        await entityRow(real.page, name).click();
        model.selectedEntity = name;
      })),
    ),
    ...entityCandidates.map((name) =>
      fc.constant(command(`toggleVisible:${name}`, (model) => Boolean(model.entities[name]), async (model, real) => {
        const entity = model.entities[name];
        await clickRowAction(
          real.page,
          name,
          entity.visible ? "Hide this entity in the viewport" : "Show this entity in the viewport",
        );
        entity.visible = !entity.visible;
        await expect(entityRow(real.page, name)).toHaveAttribute("data-visible", String(entity.visible));
      })),
    ),
    ...entityCandidates.map((name) =>
      fc.constant(command(`toggleLocked:${name}`, (model) => Boolean(model.entities[name]), async (model, real) => {
        const entity = model.entities[name];
        await clickRowAction(
          real.page,
          name,
          entity.locked ? "Unlock this entity for editing" : "Lock this entity against editing",
        );
        entity.locked = !entity.locked;
        await expect(entityRow(real.page, name)).toHaveAttribute("data-locked", String(entity.locked));
      })),
    ),
    ...(["geometry", "material", "source", "tally"] as const).map((kind) =>
      fc.constant(command(`create:${kind}`, (model) => !model.entities[defaultEntityName(kind)], async (model, real) => {
        const name = defaultEntityName(kind);
        await real.page.getByRole("button", {name: `+ ${labelForKind(kind)}`}).click();
        model.entities[name] = {kind, visible: true, locked: false};
        model.selectedEntity = name;
        await expect(entityRow(real.page, name, kind)).toBeVisible();
      })),
    ),
    ...entityCandidates.map((name) =>
      fc.constant(command(
        `duplicate:${name}`,
        (model) => Boolean(model.entities[name]) && !model.entities[`${name} Copy`],
        async (model, real) => {
          const entity = model.entities[name];
          const copyName = `${name} Copy`;
          await clickRowAction(real.page, name, "Duplicate this entity");
          model.entities[copyName] = {...entity};
          model.selectedEntity = copyName;
          await expect(entityRow(real.page, copyName, entity.kind)).toBeVisible();
        },
      )),
    ),
    ...entityCandidates.map((name) =>
      fc.constant(command(
        `delete:${name}`,
        (model) => Boolean(model.entities[name]) && !model.entities[name].locked && Object.keys(model.entities).length > 1,
        async (model, real) => {
          await clickRowAction(real.page, name, "Delete this entity");
          delete model.entities[name];
          if (model.selectedEntity === name) {
            model.selectedEntity = undefined;
          }
          await expect(entityRow(real.page, name)).toHaveCount(0);
        },
      )),
    ),
  ];
}

function command(
  label: string,
  check: (model: Readonly<StudioModel>) => boolean,
  run: (model: StudioModel, real: StudioReal) => Promise<void>,
): AsyncCommand<StudioModel, StudioReal> {
  return {
    check,
    async run(model, real) {
      await run(model, real);
      await assertStableStudioShell(real.page, real.failures);
    },
    toString: () => label,
  };
}

function createInitialModel(): StudioModel {
  return {
    entities: Object.fromEntries(
      Object.entries(initialEntities).map(([name, entity]) => [name, {...entity}]),
    ),
    selectedEntity: "Shield Slab",
  };
}

function defaultEntityName(kind: EntityKind): string {
  return `New ${labelForKind(kind)}`;
}

function labelForKind(kind: EntityKind): string {
  switch (kind) {
    case "geometry":
      return "Geometry";
    case "material":
      return "Material";
    case "source":
      return "Source";
    case "tally":
      return "Tally";
  }
}

function readIntegerEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}
