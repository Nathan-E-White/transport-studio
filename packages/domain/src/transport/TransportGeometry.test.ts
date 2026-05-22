

import { describe, expect, it } from "vitest";
import {
  createPlaneSurface,
  createSphereSurface,
  createTransportBox,
  createTransportGeometry,
  createTransportMesh,
  createTransportRegion,
  entityRef,
  estimateEntityVolume,
  estimateEntityVolumeDetailed,
  findGeometryEntity,
  findRegion,
  findSurface,
  getGeometryEntityIds,
  getRegionIds,
  getRegionSupport,
  getSurfaceIds,
  getTransportEntityLabel,
  halfSpace,
  hasGeometryEntity,
  hasRegion,
  hasSurface,
  identityTransportTransform,
  isGeometryReadyForTransport,
  isTransportBox,
  regionAnd,
  validateGeometry,
  validateGeometryEntity,
  validateRegion,
  validateSurface,
} from "./TransportGeometry";

describe("TransportGeometry", () => {
  it("creates an identity transform", () => {
    expect(identityTransportTransform()).toEqual({
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
    });
  });

  it("creates an empty geometry by default", () => {
    expect(createTransportGeometry()).toEqual({
      entities: [],
      surfaces: [],
      regions: [],
      partition: undefined,
      assets: undefined,
    });
  });

  it("supports the legacy entity-array geometry constructor form", () => {
    const box = createTransportBox({
      id: "box-1",
      name: "Shield Box",
      materialId: "mat-water",
      size: { x: 2, y: 3, z: 4 },
    });

    expect(createTransportGeometry([box])).toEqual({
      entities: [box],
      surfaces: [],
      regions: [],
    });
  });

  it("creates a geometry with entities, surfaces, and regions", () => {
    const box = createTransportBox({
      id: "box-1",
      name: "Shield Box",
      materialId: "mat-water",
      size: { x: 2, y: 3, z: 4 },
    });
    const surface = createPlaneSurface({
      id: "sx-min",
      name: "X Min",
      normal: { x: 1, y: 0, z: 0 },
      offset: 1,
    });
    const region = createTransportRegion({
      id: "region-1",
      name: "Water Cell",
      materialId: "mat-water",
      expression: halfSpace("sx-min", "positive"),
    });

    expect(
      createTransportGeometry({
        entities: [box],
        surfaces: [surface],
        regions: [region],
      }),
    ).toEqual({
      entities: [box],
      surfaces: [surface],
      regions: [region],
      partition: undefined,
      assets: undefined,
    });
  });

  it("creates boxes with default transform and labels them", () => {
    const box = createTransportBox({
      id: "box-1",
      name: "Shield Box",
      materialId: "mat-water",
      size: { x: 2, y: 3, z: 4 },
    });

    expect(box).toEqual({
      id: "box-1",
      kind: "box",
      name: "Shield Box",
      materialId: "mat-water",
      transform: identityTransportTransform(),
      tags: undefined,
      size: { x: 2, y: 3, z: 4 },
    });
    expect(isTransportBox(box)).toBe(true);
    expect(getTransportEntityLabel(box)).toBe("Box: Shield Box");
  });

  it("finds entities, surfaces, and regions by id", () => {
    const box = createTransportBox({
      id: "box-1",
      name: "Shield Box",
      materialId: "mat-water",
      size: { x: 2, y: 3, z: 4 },
    });
    const surface = createSphereSurface({
      id: "sphere-surface-1",
      name: "Sphere Boundary",
      center: { x: 0, y: 0, z: 0 },
      radius: 10,
    });
    const region = createTransportRegion({
      id: "region-1",
      name: "Sphere Interior",
      materialId: "mat-air",
      expression: halfSpace("sphere-surface-1", "negative"),
    });
    const geometry = createTransportGeometry({
      entities: [box],
      surfaces: [surface],
      regions: [region],
    });

    expect(findGeometryEntity(geometry, "box-1")).toBe(box);
    expect(findSurface(geometry, "sphere-surface-1")).toBe(surface);
    expect(findRegion(geometry, "region-1")).toBe(region);

    expect(hasGeometryEntity(geometry, "box-1")).toBe(true);
    expect(hasSurface(geometry, "sphere-surface-1")).toBe(true);
    expect(hasRegion(geometry, "region-1")).toBe(true);

    expect(getGeometryEntityIds(geometry)).toEqual(["box-1"]);
    expect(getSurfaceIds(geometry)).toEqual(["sphere-surface-1"]);
    expect(getRegionIds(geometry)).toEqual(["region-1"]);
  });

  it("estimates exact analytic primitive volumes", () => {
    const box = createTransportBox({
      id: "box-1",
      name: "Box",
      materialId: "mat-water",
      size: { x: 2, y: 3, z: 4 },
    });

    expect(estimateEntityVolume(box)).toBe(24);
    expect(estimateEntityVolumeDetailed(box)).toEqual({
      kind: "exact",
      value: 24,
    });
    expect(getRegionSupport(box)).toBe("analytic");
  });

  it("returns approximate or unknown volume estimates for mesh-backed entities", () => {
    const meshWithVolume = createTransportMesh({
      id: "mesh-1",
      name: "Imported Shield",
      materialId: "mat-lead",
      meshId: "mesh-asset-1",
      boundaryMode: "watertight-solid",
      approximateVolume: 42,
    });
    const meshWithoutVolume = createTransportMesh({
      id: "mesh-2",
      name: "Imported Surface",
      materialId: "mat-air",
      meshId: "mesh-asset-2",
    });

    expect(estimateEntityVolumeDetailed(meshWithVolume)).toEqual({
      kind: "approximate",
      value: 42,
      method: "mesh preprocessing",
    });
    expect(estimateEntityVolume(meshWithoutVolume)).toBeNaN();
    expect(estimateEntityVolumeDetailed(meshWithoutVolume)).toEqual({
      kind: "unknown",
      reason: "volume requires mesh preprocessing",
    });
    expect(getRegionSupport(meshWithVolume)).toBe("discrete");
  });

  it("validates a simple surface/region geometry", () => {
    const surface = createPlaneSurface({
      id: "s1",
      name: "Plane",
      normal: { x: 1, y: 0, z: 0 },
      offset: 0,
    });
    const region = createTransportRegion({
      id: "r1",
      name: "Positive Side",
      materialId: "mat-air",
      expression: halfSpace("s1", "positive"),
    });
    const geometry = createTransportGeometry({
      surfaces: [surface],
      regions: [region],
    });

    expect(validateSurface(surface)).toEqual([]);
    expect(validateRegion(region, {
      entityIds: new Set(),
      surfaceIds: new Set(["s1"]),
      regionIds: new Set(["r1"]),
    })).toEqual([]);
    expect(validateGeometry(geometry)).toEqual([]);
    expect(isGeometryReadyForTransport(geometry)).toBe(true);
  });

  it("reports invalid primitive entity diagnostics", () => {
    const badBox = createTransportBox({
      id: "box-1",
      name: "Bad Box",
      materialId: "",
      size: { x: 0, y: 1, z: 1 },
    });

    expect(validateGeometryEntity(badBox)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "geometry.entity.material.missing",
          level: "error",
          entityId: "box-1",
        }),
        expect.objectContaining({
          code: "geometry.box.size.invalid",
          level: "error",
          entityId: "box-1",
        }),
      ]),
    );
  });

  it("reports invalid surface diagnostics", () => {
    const badSurface = createPlaneSurface({
      id: "s-bad",
      name: "Bad Plane",
      normal: { x: 0, y: 0, z: 0 },
      offset: Number.NaN,
    });

    expect(validateSurface(badSurface)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "geometry.surface.plane.invalid",
          level: "error",
          surfaceId: "s-bad",
        }),
      ]),
    );
  });

  it("reports missing surface and entity references in region expressions", () => {
    const region = createTransportRegion({
      id: "r1",
      name: "Broken Region",
      materialId: "mat-air",
      expression: regionAnd([
        halfSpace("missing-surface", "positive"),
        entityRef("missing-entity"),
      ]),
    });

    expect(validateGeometry(createTransportGeometry({ regions: [region] }))).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "geometry.region.surface.invalid",
          level: "error",
          regionId: "r1",
          surfaceId: "missing-surface",
        }),
        expect.objectContaining({
          code: "geometry.region.entity.invalid",
          level: "error",
          regionId: "r1",
          entityId: "missing-entity",
        }),
      ]),
    );
  });

  it("reports duplicate entity, surface, and region ids", () => {
    const boxA = createTransportBox({
      id: "dup-entity",
      name: "Box A",
      materialId: "mat-water",
      size: { x: 1, y: 1, z: 1 },
    });
    const boxB = createTransportBox({
      id: "dup-entity",
      name: "Box B",
      materialId: "mat-water",
      size: { x: 1, y: 1, z: 1 },
    });
    const surfaceA = createPlaneSurface({
      id: "dup-surface",
      name: "Surface A",
      normal: { x: 1, y: 0, z: 0 },
      offset: 0,
    });
    const surfaceB = createPlaneSurface({
      id: "dup-surface",
      name: "Surface B",
      normal: { x: 0, y: 1, z: 0 },
      offset: 0,
    });
    const regionA = createTransportRegion({
      id: "dup-region",
      name: "Region A",
      expression: halfSpace("dup-surface", "positive"),
    });
    const regionB = createTransportRegion({
      id: "dup-region",
      name: "Region B",
      expression: halfSpace("dup-surface", "negative"),
    });

    expect(
      validateGeometry(
        createTransportGeometry({
          entities: [boxA, boxB],
          surfaces: [surfaceA, surfaceB],
          regions: [regionA, regionB],
        }),
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "geometry.entity.id.duplicate", level: "error" }),
        expect.objectContaining({ code: "geometry.surface.id.duplicate", level: "error" }),
        expect.objectContaining({ code: "geometry.region.id.duplicate", level: "error" }),
      ]),
    );
  });
});