import { describe, expect, it } from "vitest";
import {
  createCellFluxTally,
  createPulseHeightTally,
  createSurfaceCurrentTally,
  createTrackLengthTally,
  getTallyLabel,
  isCellFluxTally,
  isPulseHeightTally,
  isSurfaceCurrentTally,
  isTallyEnabled,
  isTallyReadyForTransport,
  isTrackLengthTally,
  referencesEntity,
  validateTally,
} from "./EditorTally";

describe("EditorTally", () => {
  it("creates a cell flux tally with default enabled state", () => {
    const tally = createCellFluxTally({
      id: "tally-1",
      name: "Box Flux",
      particle: "photon",
      entityId: "box-1",
    });

    expect(tally).toEqual({
      id: "tally-1",
      name: "Box Flux",
      kind: "cell-flux",
      particle: "photon",
      entityId: "box-1",
      enabled: true,
      tags: undefined,
    });
  });

  it("preserves explicit enabled state and tags", () => {
    const tally = createSurfaceCurrentTally({
      id: "tally-2",
      name: "Surface Current",
      particle: "neutron",
      entityId: "surface-1",
      enabled: false,
      tags: ["debug", "surface"],
    });

    expect(tally).toEqual({
      id: "tally-2",
      name: "Surface Current",
      kind: "surface-current",
      particle: "neutron",
      entityId: "surface-1",
      enabled: false,
      tags: ["debug", "surface"],
    });
  });

  it("creates all supported tally kinds", () => {
    expect(
      createCellFluxTally({
        id: "cell-1",
        name: "Cell Flux",
        particle: "photon",
        entityId: "box-1",
      }),
    ).toMatchObject({ kind: "cell-flux" });

    expect(
      createSurfaceCurrentTally({
        id: "surface-1",
        name: "Surface Current",
        particle: "neutron",
        entityId: "surface-entity-1",
      }),
    ).toMatchObject({ kind: "surface-current" });

    expect(
      createTrackLengthTally({
        id: "track-1",
        name: "Track Length",
        particle: "electron",
        entityId: "cell-1",
      }),
    ).toMatchObject({ kind: "track-length" });

    expect(
      createPulseHeightTally({
        id: "pulse-1",
        name: "Pulse Height",
        particle: "photon",
        entityId: "detector-1",
      }),
    ).toMatchObject({ kind: "pulse-height" });
  });

  it("narrows tally types by kind", () => {
    const cellFlux = createCellFluxTally({
      id: "cell-1",
      name: "Cell Flux",
      particle: "photon",
      entityId: "box-1",
    });
    const surfaceCurrent = createSurfaceCurrentTally({
      id: "surface-1",
      name: "Surface Current",
      particle: "neutron",
      entityId: "surface-entity-1",
    });
    const trackLength = createTrackLengthTally({
      id: "track-1",
      name: "Track Length",
      particle: "electron",
      entityId: "cell-1",
    });
    const pulseHeight = createPulseHeightTally({
      id: "pulse-1",
      name: "Pulse Height",
      particle: "photon",
      entityId: "detector-1",
    });

    expect(isCellFluxTally(cellFlux)).toBe(true);
    expect(isSurfaceCurrentTally(surfaceCurrent)).toBe(true);
    expect(isTrackLengthTally(trackLength)).toBe(true);
    expect(isPulseHeightTally(pulseHeight)).toBe(true);

    expect(isSurfaceCurrentTally(cellFlux)).toBe(false);
    expect(isTrackLengthTally(surfaceCurrent)).toBe(false);
    expect(isPulseHeightTally(trackLength)).toBe(false);
    expect(isCellFluxTally(pulseHeight)).toBe(false);
  });

  it("returns user-facing tally labels", () => {
    expect(
      getTallyLabel(
        createCellFluxTally({
          id: "cell-1",
          name: "A",
          particle: "photon",
          entityId: "box-1",
        }),
      ),
    ).toBe("Cell Flux Tally: A");

    expect(
      getTallyLabel(
        createSurfaceCurrentTally({
          id: "surface-1",
          name: "B",
          particle: "neutron",
          entityId: "surface-entity-1",
        }),
      ),
    ).toBe("Surface Current Tally: B");

    expect(
      getTallyLabel(
        createTrackLengthTally({
          id: "track-1",
          name: "C",
          particle: "electron",
          entityId: "cell-1",
        }),
      ),
    ).toBe("Track Length Tally: C");

    expect(
      getTallyLabel(
        createPulseHeightTally({
          id: "pulse-1",
          name: "D",
          particle: "photon",
          entityId: "detector-1",
        }),
      ),
    ).toBe("Pulse Height Tally: D");
  });

  it("checks enabled state and entity references", () => {
    const enabled = createCellFluxTally({
      id: "tally-1",
      name: "Enabled",
      particle: "photon",
      entityId: "box-1",
    });
    const disabled = createCellFluxTally({
      id: "tally-2",
      name: "Disabled",
      particle: "photon",
      entityId: "box-2",
      enabled: false,
    });

    expect(isTallyEnabled(enabled)).toBe(true);
    expect(isTallyEnabled(disabled)).toBe(false);

    expect(referencesEntity(enabled, "box-1")).toBe(true);
    expect(referencesEntity(enabled, "box-2")).toBe(false);
  });

  it("validates a ready tally without an entity set", () => {
    const tally = createCellFluxTally({
      id: "tally-1",
      name: "Box Flux",
      particle: "photon",
      entityId: "box-1",
    });

    expect(validateTally(tally)).toEqual([]);
    expect(isTallyReadyForTransport(tally)).toBe(true);
  });

  it("validates a ready tally against an existing entity set", () => {
    const tally = createSurfaceCurrentTally({
      id: "tally-1",
      name: "Surface Current",
      particle: "neutron",
      entityId: "surface-1",
    });
    const existingEntityIds = new Set(["surface-1", "box-1"]);

    expect(validateTally(tally, existingEntityIds)).toEqual([]);
    expect(isTallyReadyForTransport(tally, existingEntityIds)).toBe(true);
  });

  it("reports invalid tally diagnostics", () => {
    const tally = createCellFluxTally({
      id: "",
      name: "",
      particle: "photon",
      entityId: "",
    });

    expect(validateTally(tally)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "tally.id.missing", level: "error" }),
        expect.objectContaining({ code: "tally.name.missing", level: "error" }),
        expect.objectContaining({ code: "tally.entity.missing", level: "error" }),
      ]),
    );
    expect(isTallyReadyForTransport(tally)).toBe(false);
  });

  it("reports missing referenced entities when an entity set is provided", () => {
    const tally = createTrackLengthTally({
      id: "tally-1",
      name: "Track Length",
      particle: "electron",
      entityId: "missing-entity",
    });

    expect(validateTally(tally, new Set(["box-1"]))).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "tally.entity.invalid",
          level: "error",
          tallyId: "tally-1",
        }),
      ]),
    );
    expect(isTallyReadyForTransport(tally, new Set(["box-1"]))).toBe(false);
  });

  it("warns on disabled tallies and excludes them from transport readiness", () => {
    const tally = createPulseHeightTally({
      id: "tally-1",
      name: "Pulse Height",
      particle: "photon",
      entityId: "detector-1",
      enabled: false,
    });

    expect(validateTally(tally, new Set(["detector-1"]))).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "tally.disabled",
          level: "warning",
          tallyId: "tally-1",
        }),
      ]),
    );
    expect(isTallyReadyForTransport(tally, new Set(["detector-1"]))).toBe(false);
  });
});