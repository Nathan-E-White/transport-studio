import type {Vec3} from "@transport/shared";

/**
 * Backend-facing geometry model.
 *
 * This file deliberately keeps transport geometry as plain serializable data.
 * Behavior lives in pure functions and per-kind operation tables rather than
 * classes, so geometry can be saved, diffed, hashed, sent to workers, compiled
 * to backend-specific schemas, and tested with simple fixtures.
 */
export type TransportEntityId = string;
export type TransportMaterialId = string;
export type MeshAssetId = string;
export type ScalarFieldId = string;
export type VoxelGridId = string;
export type TransportSurfaceID = string;
export type TransportRegionID = string;
export type AccelerationAssetID = string;

export type AnalyticPrimitiveKind = "box" | "sphere" | "cylinder";
export type DiscreteGeometryKind = "mesh" | "voxel-region";
export type ProceduralGeometryKind = "implicit-region" | "csg-region";

/**
 * @type GeometryEntityKind
 */
export type GeometryEntityKind =
    | AnalyticPrimitiveKind
    | DiscreteGeometryKind
    | ProceduralGeometryKind;

export interface Transform3D {
    readonly position: Vec3;
    readonly rotation: Vec3;
}

export interface AxisAlignedBoundingBox {
    readonly min: Vec3;
    readonly max: Vec3;
}

export type TransportSurfaceKind =
    | "plane"
    | "sphere-surface"
    | "cylinder-surface"
    | "quadratic-surface"
    | "mesh-surface"
    | "implicit-surface";

export type SurfaceBoundaryCondition =
    | "transmission"
    | "vacuum"
    | "reflective"
    | "periodic"
    | "white";

export type LengthUnit = "cm" | "mm" | "m";

export interface TransportSurfaceBase<K extends TransportSurfaceKind = TransportSurfaceKind> {
    readonly id: TransportSurfaceID;
    readonly kind: K;
    readonly name: string;
    readonly transform?: Transform3D;
    readonly boundaryCondition?: SurfaceBoundaryCondition;
    readonly tags?: readonly string[];
}

export interface TransportPlaneSurface extends TransportSurfaceBase <"plane"> {
    readonly normal: Vec3;
    readonly offset: number;
}

export interface TransportSphereSurface extends TransportSurfaceBase<"sphere-surface"> {
    readonly center: Vec3;
    readonly radius: number;
}

export interface TransportCylinderSurface extends TransportSurfaceBase<"cylinder-surface"> {
    readonly axis: "x" | "y" | "z" | Vec3;
    readonly center: Vec3;
    readonly radius: number;
}

export interface TransportQuadraticSurface extends TransportSurfaceBase<"quadratic-surface"> {
    readonly coefficients: {
        readonly xx: number;
        readonly yy: number;
        readonly zz: number;
        readonly xy: number;
        readonly xz: number;
        readonly yz: number;
        readonly x: number;
        readonly y: number;
        readonly z: number;
        readonly c: number;
    }
}

export interface TransportImplicitSurface extends TransportSurfaceBase<"implicit-surface"> {
    readonly expression: string;
    readonly boundingBox?: AxisAlignedBoundingBox;
}

export interface TransportMeshSurface extends TransportSurfaceBase<"mesh-surface"> {
    readonly meshID: MeshAssetId;
    readonly units: LengthUnit;
    readonly watertight?: boolean;
    readonly manifold?: boolean;
    readonly boundingBox?: AxisAlignedBoundingBox;
}

export type TransportSurface =
    | TransportPlaneSurface
    | TransportSphereSurface
    | TransportCylinderSurface
    | TransportQuadraticSurface
    | TransportImplicitSurface
    | TransportMeshSurface;

export interface CreateSurfaceBaseOptions {
    readonly id: TransportSurfaceID;
    readonly name: string;
    readonly transform?: Transform3D;
    readonly boundaryCondition?: SurfaceBoundaryCondition;
    readonly tags?: readonly string[];
}


export interface CreatePlaneSurfaceOptions extends CreateSurfaceBaseOptions {
    readonly normal: Vec3;
    readonly offset: number;
}



export interface CreateSphereSurfaceOptions extends CreateSurfaceBaseOptions {
    readonly center: Vec3;
    readonly radius: number;
}


export interface CreateCylindricalSurfaceOptions extends CreateSurfaceBaseOptions {
    readonly axis: TransportCylinderSurface["axis"];
    readonly center: Vec3;
    readonly radius: number;
}


export interface CreateQuadraticSurfaceOptions extends CreateSurfaceBaseOptions {
    readonly coefficients: TransportQuadraticSurface["coefficients"];
}

export interface CreateMeshSurfaceOptions extends CreateSurfaceBaseOptions {
    readonly meshID: MeshAssetId;
    readonly units?: LengthUnit;
    readonly watertight?: boolean;
    readonly manifold?: boolean;
    readonly boundingBox?: AxisAlignedBoundingBox;
}

export interface CreateImplicitSurfaceOptions extends CreateSurfaceBaseOptions {
    readonly expression: string;
    readonly boundingBox?: AxisAlignedBoundingBox;
}


export type SurfaceSense = "positive" | "negative";

export type RegionExpression =
    | { readonly kind: "half-space"; readonly surfaceId: TransportSurfaceID; readonly sense: SurfaceSense }
    | { readonly kind: "and"; readonly children: readonly RegionExpression[] }
    | { readonly kind: "or"; readonly children: readonly RegionExpression[] }
    | { readonly kind: "not"; readonly child: RegionExpression }
    | { readonly kind: "difference"; readonly left: RegionExpression; readonly right: RegionExpression }
    | { readonly kind: "region-ref"; readonly regionId: TransportRegionID }
    | { readonly kind: "entity-ref"; readonly entityId: TransportEntityId };

export interface TransportRegion {
    readonly id: TransportRegionID;
    readonly name: string;
    readonly materialID?: TransportMaterialId;
    readonly expression: RegionExpression;
    readonly densityOverride: number;
    readonly importance?: Partial<Record<"photon" | "neutron" | "electron", number>>;
    readonly tags?: readonly string[];
}

export interface CreateTransportRegionOptions {
    readonly id: TransportRegionID;
    readonly name: string;
    readonly materialId?: TransportMaterialId;
    readonly materialID?: TransportMaterialId;
    readonly expression: RegionExpression;
    readonly densityOverride?: number;
    readonly importance?: Partial<Record<"photon" | "neutron" | "electron", number>>;
    readonly tags?: readonly string[];
}

export interface RegionAdjacency {
    readonly fromRegionID: TransportRegionID;
    readonly toRegionID: TransportRegionID;
    readonly throughSurfaceID: TransportSurfaceID;
}

export interface TransportPartition {
    readonly regionIDs: readonly TransportRegionID[];
    readonly exteriorRegionID?: TransportRegionID;
    readonly adjacencies: readonly RegionAdjacency[];
    readonly accelerationAssetID?: AccelerationAssetID;
}

export interface GeometryAssetManifest {
    // readonly meshes?: Readonly<Record<MeshAssetId, MeshAssetDescriptor>>;
    // readonly voxelGrids?: Readonly<Record<VoxelGridId, VoxelGridDescriptor>>;
    // readonly scalarFields?: Readonly<Record<ScalarFieldId, ScalarFieldDescriptor>>;
    // readonly accelerationStructures?: Readonly<Record<AccelerationAssetID, AccelerationIDDescriptor>>;
}

interface IdIndex<TId extends string> {
    readonly ids: readonly TId[];
    readonly indexById: ReadonlyMap<TId, number>;
}


interface CompiledSurfaceTable {
    readonly ids: Uint32Array;
    readonly kinds: Uint8Array;
    readonly paramsOffset: Uint32Array;

}


interface GeometryAssetStore {
    // getMesh(id: MeshAssetId): Promise<TriangleMeshData>;
    // getVoxelGrid(id: VoxelGridId): Promise<VoxelGridData>;
}


export interface TransportGeometry {
    readonly entities: readonly TransportGeometryEntity[];
    readonly surfaces: readonly TransportSurface[];
    readonly regions: readonly TransportRegion[];
    readonly partition?: TransportPartition;
    readonly assets?: GeometryAssetManifest;
}

export interface TransportGeometryEntityBase<K extends GeometryEntityKind = GeometryEntityKind> {
    readonly id: TransportEntityId;
    readonly kind: K;
    readonly name: string;
    readonly materialId: TransportMaterialId;
    readonly transform: Transform3D;
    readonly tags?: readonly string[];
}

/** Backward-compatible alias for older call sites. */
export type GeometryEntityBase<K extends GeometryEntityKind = GeometryEntityKind> =
    TransportGeometryEntityBase<K>;

export interface TransportBox extends TransportGeometryEntityBase<"box"> {
    readonly size: Vec3;
}

export interface TransportSphere extends TransportGeometryEntityBase<"sphere"> {
    readonly radius: number;
}

export interface TransportCylinder extends TransportGeometryEntityBase<"cylinder"> {
    readonly radius: number;
    readonly height: number;
}

/**
 * Mesh-backed solid/region. A visual triangle mesh is not automatically a
 * transport-ready region; boundaryMode records the intended interpretation.
 */
export interface TransportMesh extends TransportGeometryEntityBase<"mesh"> {
    readonly meshId: MeshAssetId;
    readonly units: LengthUnit;
    readonly boundaryMode: "surface" | "watertight-solid" | "tetrahedral-volume" | "voxelized";
    readonly watertight?: boolean;
    readonly manifold?: boolean;
    readonly boundingBox?: AxisAlignedBoundingBox;
    readonly approximateVolume?: number;
}

/**
 * Numerically/procedurally defined region, usually interpreted by a level-set
 * or scalar predicate. Backends may compile this to root finding, voxelization,
 * sampled surfaces, or reject it if unsupported.
 */
export interface TransportImplicitRegion extends TransportGeometryEntityBase<"implicit-region"> {
    readonly expression: string;
    readonly convention: "inside-when-negative" | "inside-when-positive";
    readonly boundingBox: AxisAlignedBoundingBox;
    readonly approximateVolume?: number;
}

export interface TransportVoxelRegion extends TransportGeometryEntityBase<"voxel-region"> {
    readonly gridId: VoxelGridId;
    readonly dimensions: {
        readonly nx: number;
        readonly ny: number;
        readonly nz: number;
    };
    readonly voxelSize: Vec3;
    readonly threshold?: number;
    readonly approximateVolume?: number;
}

export type CsgOperator = "union" | "intersection" | "difference";

export interface TransportCsgRegion extends TransportGeometryEntityBase<"csg-region"> {
    readonly operator: CsgOperator;
    readonly childEntityIds: readonly TransportEntityId[];
    readonly boundingBox?: AxisAlignedBoundingBox;
    readonly approximateVolume?: number;
}

export type TransportAnalyticPrimitive = TransportBox | TransportSphere | TransportCylinder;

export type TransportGeometryEntity =
    | TransportBox
    | TransportSphere
    | TransportCylinder
    | TransportMesh
    | TransportImplicitRegion
    | TransportVoxelRegion
    | TransportCsgRegion;


export interface CreateTransportEntityBaseOptions {
    readonly id: TransportEntityId;
    readonly name: string;
    readonly materialId: TransportMaterialId;
    readonly transform?: Transform3D;
    readonly tags?: readonly string[];
}

export interface CreateTransportBoxOptions extends CreateTransportEntityBaseOptions {
    readonly size: Vec3;
}

export interface CreateTransportSphereOptions extends CreateTransportEntityBaseOptions {
    readonly radius: number;
}

export interface CreateTransportCylinderOptions extends CreateTransportEntityBaseOptions {
    readonly radius: number;
    readonly height: number;
}

export interface CreateTransportMeshOptions extends CreateTransportEntityBaseOptions {
    readonly meshId: MeshAssetId;
    readonly units?: LengthUnit;
    readonly boundaryMode?: TransportMesh["boundaryMode"];
    readonly watertight?: boolean;
    readonly manifold?: boolean;
    readonly boundingBox?: AxisAlignedBoundingBox;
    readonly approximateVolume?: number;
}

export interface CreateTransportImplicitRegionOptions extends CreateTransportEntityBaseOptions {
    readonly expression: string;
    readonly convention?: TransportImplicitRegion["convention"];
    readonly boundingBox: AxisAlignedBoundingBox;
    readonly approximateVolume?: number;
}

export interface CreateTransportVoxelRegionOptions extends CreateTransportEntityBaseOptions {
    readonly gridId: VoxelGridId;
    readonly dimensions: TransportVoxelRegion["dimensions"];
    readonly voxelSize: Vec3;
    readonly threshold?: number;
    readonly approximateVolume?: number;
}

export interface CreateTransportCsgRegionOptions extends CreateTransportEntityBaseOptions {
    readonly operator: CsgOperator;
    readonly childEntityIds: readonly TransportEntityId[];
    readonly boundingBox?: AxisAlignedBoundingBox;
    readonly approximateVolume?: number;
}

export interface GeometryValidationDiagnostic {
    readonly level: "warning" | "error";
    readonly code: string;
    readonly message: string;
    readonly entityId?: TransportEntityId;
}

export type VolumeEstimate =
    | { readonly kind: "exact"; readonly value: number }
    | { readonly kind: "approximate"; readonly value: number; readonly method: string }
    | { readonly kind: "unknown"; readonly reason: string };

export type RegionSupport = "analytic" | "discrete" | "procedural" | "composite";

export interface GeometryEntityOps<T extends TransportGeometryEntity> {
    readonly label: (entity: T) => string;
    readonly estimateVolume: (entity: T) => VolumeEstimate;
    readonly validate: (
        entity: T,
        context: GeometryValidationContext,
    ) => readonly GeometryValidationDiagnostic[];
    readonly regionSupport: RegionSupport;
}

/** Backward-compatible name from the shape registry discussion. */
export type ShapeOps<T extends TransportGeometryEntity> = GeometryEntityOps<T>;

export interface GeometryValidationContext {
    readonly entityIds: ReadonlySet<TransportEntityId>;
}

export function identityTransportTransform(): Transform3D {
    return {
        position: {x: 0, y: 0, z: 0},
        rotation: {x: 0, y: 0, z: 0},
    };
}

export interface CreateTransportGeometryOptions {
    readonly entities?: readonly TransportGeometryEntity[];
    readonly surfaces?: readonly TransportSurface[];
    readonly regions?: readonly TransportRegion[];
    readonly partition?: TransportPartition;
    readonly assets?: GeometryAssetManifest;
}

export function createTransportGeometry(
    opts: CreateTransportGeometryOptions | readonly TransportGeometryEntity[] = {},
): TransportGeometry {
    if (isTransportGeometryEntityArray(opts)) {
        return {
            entities: opts,
            surfaces: [],
            regions: [],
        };
    }

    return {
        entities: opts.entities ?? [],
        surfaces: opts.surfaces ?? [],
        regions: opts.regions ?? [],
        partition: opts.partition,
        assets: opts.assets,
    };
}

function isTransportGeometryEntityArray(
    value: CreateTransportGeometryOptions | readonly TransportGeometryEntity[],
): value is readonly TransportGeometryEntity[] {
    return Array.isArray(value);
}

export function createPlaneSurface(options: CreatePlaneSurfaceOptions): TransportPlaneSurface {
    return {
        ...createSurfaceBase(options, "plane"),
        normal: options.normal,
        offset: options.offset,
    };
}



export function createSphereSurface(options: CreateSphereSurfaceOptions): TransportSphereSurface {
    return {
        ...createSurfaceBase(options, "sphere-surface"),
        center: options.center,
        radius: options.radius,
    };
}

export function createCylindricalSurface(options: CreateCylindricalSurfaceOptions): TransportCylinderSurface {
    return {
        ...createSurfaceBase(options, "cylinder-surface"),
        axis: options.axis,
        center: options.center,
        radius: options.radius,
    };
}

export function createCylinderSurface(options: CreateCylindricalSurfaceOptions): TransportCylinderSurface {
    return createCylindricalSurface(options);
}

export function createQuadraticSurface(options: CreateQuadraticSurfaceOptions): TransportQuadraticSurface {
    return {
        ...createSurfaceBase(options, "quadratic-surface"),
        coefficients: options.coefficients,
    };
}

export function createMeshSurface(options: CreateMeshSurfaceOptions): TransportMeshSurface {
    return {
        ...createSurfaceBase(options, "mesh-surface"),
        meshID: options.meshID,
        units: options.units ?? "cm",
        watertight: options.watertight,
        manifold: options.manifold,
        boundingBox: options.boundingBox,
    };
}

export function createImplicitSurface(options: CreateImplicitSurfaceOptions): TransportImplicitSurface {
    return {
        ...createSurfaceBase(options, "implicit-surface"),
        expression: options.expression,
        boundingBox: options.boundingBox,
    };
}

export function createTransportRegion(options: CreateTransportRegionOptions): TransportRegion {
    return {
        id: options.id,
        name: options.name,
        materialID: options.materialID ?? options.materialId,
        expression: options.expression,
        densityOverride: options.densityOverride ?? 0,
        importance: options.importance,
        tags: options.tags,
    };
}

function createSurfaceBase<K extends TransportSurfaceKind>(
    options: CreateSurfaceBaseOptions,
    kind: K,
): TransportSurfaceBase<K> {
    return {
        id: options.id,
        kind,
        name: options.name,
        transform: options.transform,
        boundaryCondition: options.boundaryCondition,
        tags: options.tags,
    };
}

export function createTransportBox(options: CreateTransportBoxOptions): TransportBox {
    return {
        ...createTransportEntityBase(options, "box"),
        size: options.size,
    };
}

export function createTransportSphere(options: CreateTransportSphereOptions): TransportSphere {
    return {
        ...createTransportEntityBase(options, "sphere"),
        radius: options.radius,
    };
}

export function createTransportCylinder(options: CreateTransportCylinderOptions): TransportCylinder {
    return {
        ...createTransportEntityBase(options, "cylinder"),
        radius: options.radius,
        height: options.height,
    };
}

export function createTransportMesh(options: CreateTransportMeshOptions): TransportMesh {
    return {
        ...createTransportEntityBase(options, "mesh"),
        meshId: options.meshId,
        units: options.units ?? "cm",
        boundaryMode: options.boundaryMode ?? "surface",
        watertight: options.watertight,
        manifold: options.manifold,
        boundingBox: options.boundingBox,
        approximateVolume: options.approximateVolume,
    };
}

export function createTransportImplicitRegion(
    options: CreateTransportImplicitRegionOptions,
): TransportImplicitRegion {
    return {
        ...createTransportEntityBase(options, "implicit-region"),
        expression: options.expression,
        convention: options.convention ?? "inside-when-negative",
        boundingBox: options.boundingBox,
        approximateVolume: options.approximateVolume,
    };
}

export function createTransportVoxelRegion(
    options: CreateTransportVoxelRegionOptions,
): TransportVoxelRegion {
    return {
        ...createTransportEntityBase(options, "voxel-region"),
        gridId: options.gridId,
        dimensions: options.dimensions,
        voxelSize: options.voxelSize,
        threshold: options.threshold,
        approximateVolume: options.approximateVolume,
    };
}

export function createTransportCsgRegion(options: CreateTransportCsgRegionOptions): TransportCsgRegion {
    return {
        ...createTransportEntityBase(options, "csg-region"),
        operator: options.operator,
        childEntityIds: options.childEntityIds,
        boundingBox: options.boundingBox,
        approximateVolume: options.approximateVolume,
    };
}

export function isTransportBox(entity: TransportGeometryEntity): entity is TransportBox {
    return entity.kind === "box";
}

export function isTransportSphere(entity: TransportGeometryEntity): entity is TransportSphere {
    return entity.kind === "sphere";
}

export function isTransportCylinder(entity: TransportGeometryEntity): entity is TransportCylinder {
    return entity.kind === "cylinder";
}

export function isTransportMesh(entity: TransportGeometryEntity): entity is TransportMesh {
    return entity.kind === "mesh";
}

export function isTransportImplicitRegion(
    entity: TransportGeometryEntity,
): entity is TransportImplicitRegion {
    return entity.kind === "implicit-region";
}

export function isTransportVoxelRegion(entity: TransportGeometryEntity): entity is TransportVoxelRegion {
    return entity.kind === "voxel-region";
}

export function isTransportCsgRegion(entity: TransportGeometryEntity): entity is TransportCsgRegion {
    return entity.kind === "csg-region";
}

export function isAnalyticPrimitive(
    entity: TransportGeometryEntity,
): entity is TransportAnalyticPrimitive {
    return entity.kind === "box" || entity.kind === "sphere" || entity.kind === "cylinder";
}

const geometryEntityOps = {
    box: {
        label: (entity) => `Box: ${entity.name}`,
        estimateVolume: (entity) => exactVolume(entity.size.x * entity.size.y * entity.size.z),
        validate: (entity) => validateBox(entity),
        regionSupport: "analytic",
    },
    sphere: {
        label: (entity) => `Sphere: ${entity.name}`,
        estimateVolume: (entity) => exactVolume((4 / 3) * Math.PI * entity.radius ** 3),
        validate: (entity) => validateSphere(entity),
        regionSupport: "analytic",
    },
    cylinder: {
        label: (entity) => `Cylinder: ${entity.name}`,
        estimateVolume: (entity) => exactVolume(Math.PI * entity.radius ** 2 * entity.height),
        validate: (entity) => validateCylinder(entity),
        regionSupport: "analytic",
    },
    mesh: {
        label: (entity) => `Mesh: ${entity.name}`,
        estimateVolume: (entity) => approximateOrUnknown(entity.approximateVolume, "mesh preprocessing"),
        validate: (entity) => validateMesh(entity),
        regionSupport: "discrete",
    },
    "implicit-region": {
        label: (entity) => `Implicit Region: ${entity.name}`,
        estimateVolume: (entity) => approximateOrUnknown(entity.approximateVolume, "implicit region integration"),
        validate: (entity) => validateImplicitRegion(entity),
        regionSupport: "procedural",
    },
    "voxel-region": {
        label: (entity) => `Voxel Region: ${entity.name}`,
        estimateVolume: (entity) => estimateVoxelRegionVolume(entity),
        validate: (entity) => validateVoxelRegion(entity),
        regionSupport: "discrete",
    },
    "csg-region": {
        label: (entity) => `CSG Region: ${entity.name}`,
        estimateVolume: (entity) => approximateOrUnknown(entity.approximateVolume, "CSG evaluation"),
        validate: (entity, context) => validateCsgRegion(entity, context),
        regionSupport: "composite",
    },
} satisfies {
    readonly [K in TransportGeometryEntity["kind"]]: GeometryEntityOps<
        Extract<TransportGeometryEntity, { readonly kind: K }>
    >;
};

export function getTransportEntityLabel(entity: TransportGeometryEntity): string {
    return dispatchGeometryOps(entity, (ops, narrowed) => ops.label(narrowed));
}

export function estimateEntityVolume(entity: TransportGeometryEntity): number {
    const estimate = estimateEntityVolumeDetailed(entity);
    return estimate.kind === "unknown" ? Number.NaN : estimate.value;
}

export function estimateEntityVolumeDetailed(entity: TransportGeometryEntity): VolumeEstimate {
    return dispatchGeometryOps(entity, (ops, narrowed) => ops.estimateVolume(narrowed));
}

export function getRegionSupport(entity: TransportGeometryEntity): RegionSupport {
    return dispatchGeometryOps(entity, (ops) => ops.regionSupport);
}

export function findGeometryEntity(
    geometry: TransportGeometry,
    entityId: TransportEntityId,
): TransportGeometryEntity | undefined {
    return geometry.entities.find((entity) => entity.id === entityId);
}

export function getGeometryEntityIds(geometry: TransportGeometry): readonly TransportEntityId[] {
    return geometry.entities.map((entity) => entity.id);
}

export function hasGeometryEntity(
    geometry: TransportGeometry,
    entityId: TransportEntityId,
): boolean {
    return findGeometryEntity(geometry, entityId) !== undefined;
}

export function validateGeometry(geometry: TransportGeometry): readonly GeometryValidationDiagnostic[] {
    const diagnostics: GeometryValidationDiagnostic[] = [];
    const seenIds = new Set<TransportEntityId>();
    const duplicateIds = new Set<TransportEntityId>();
    const context: GeometryValidationContext = {
        entityIds: new Set(geometry.entities.map((entity) => entity.id)),
    };

    for (const entity of geometry.entities) {
        if (seenIds.has(entity.id) && !duplicateIds.has(entity.id)) {
            diagnostics.push({
                level: "error",
                code: "geometry.entity.id.duplicate",
                message: `Duplicate geometry entity id "${entity.id}" found.`,
                entityId: entity.id,
            });
            duplicateIds.add(entity.id);
        }

        seenIds.add(entity.id);
        diagnostics.push(...validateGeometryEntity(entity, context));
    }

    return diagnostics;
}

export function validateGeometryEntity(
    entity: TransportGeometryEntity,
    context: GeometryValidationContext = {entityIds: new Set([entity.id])},
): readonly GeometryValidationDiagnostic[] {
    const diagnostics: GeometryValidationDiagnostic[] = [];

    diagnostics.push(...validateGeometryEntityBase(entity));
    diagnostics.push(...dispatchGeometryOps(entity, (ops, narrowed) => ops.validate(narrowed, context)));

    return diagnostics;
}

export function isGeometryReadyForTransport(geometry: TransportGeometry): boolean {
    return validateGeometry(geometry).every((diagnostic) => diagnostic.level !== "error");
}

function createTransportEntityBase<K extends GeometryEntityKind>(
    options: CreateTransportEntityBaseOptions,
    kind: K,
): TransportGeometryEntityBase<K> {
    return {
        id: options.id,
        kind,
        name: options.name,
        materialId: options.materialId,
        transform: options.transform ?? identityTransportTransform(),
        tags: options.tags,
    };
}

function validateGeometryEntityBase(
    entity: TransportGeometryEntity,
): readonly GeometryValidationDiagnostic[] {
    const diagnostics: GeometryValidationDiagnostic[] = [];

    if (entity.id.trim().length === 0) {
        diagnostics.push({
            level: "error",
            code: "geometry.entity.id.missing",
            message: "Geometry entity must have a non-empty id.",
            entityId: entity.id,
        });
    }

    if (entity.name.trim().length === 0) {
        diagnostics.push({
            level: "error",
            code: "geometry.entity.name.missing",
            message: "Geometry entity must have a non-empty name.",
            entityId: entity.id,
        });
    }

    if (entity.materialId.trim().length === 0) {
        diagnostics.push({
            level: "error",
            code: "geometry.entity.material.missing",
            message: `Geometry entity "${entity.name}" must reference a material.`,
            entityId: entity.id,
        });
    }

    if (!isValidVec3(entity.transform.position) || !isValidVec3(entity.transform.rotation)) {
        diagnostics.push({
            level: "error",
            code: "geometry.entity.transform.invalid",
            message: `Geometry entity "${entity.name}" has an invalid transform.`,
            entityId: entity.id,
        });
    }

    return diagnostics;
}

function validateBox(entity: TransportBox): readonly GeometryValidationDiagnostic[] {
    if (isPositiveVec3(entity.size)) {
        return [];
    }

    return [
        {
            level: "error",
            code: "geometry.box.size.invalid",
            message: `Box "${entity.name}" must have positive x, y, and z dimensions.`,
            entityId: entity.id,
        },
    ];
}

function validateSphere(entity: TransportSphere): readonly GeometryValidationDiagnostic[] {
    if (isPositiveFinite(entity.radius)) {
        return [];
    }

    return [
        {
            level: "error",
            code: "geometry.sphere.radius.invalid",
            message: `Sphere "${entity.name}" must have a positive radius.`,
            entityId: entity.id,
        },
    ];
}

function validateCylinder(entity: TransportCylinder): readonly GeometryValidationDiagnostic[] {
    if (isPositiveFinite(entity.radius) && isPositiveFinite(entity.height)) {
        return [];
    }

    return [
        {
            level: "error",
            code: "geometry.cylinder.dimensions.invalid",
            message: `Cylinder "${entity.name}" must have a positive radius and height.`,
            entityId: entity.id,
        },
    ];
}

function validateMesh(entity: TransportMesh): readonly GeometryValidationDiagnostic[] {
    const diagnostics: GeometryValidationDiagnostic[] = [];

    if (entity.meshId.trim().length === 0) {
        diagnostics.push({
            level: "error",
            code: "geometry.mesh.id.missing",
            message: `Mesh entity "${entity.name}" must reference a mesh asset.`,
            entityId: entity.id,
        });
    }

    if (entity.boundaryMode !== "surface" && entity.watertight === false) {
        diagnostics.push({
            level: "warning",
            code: "geometry.mesh.not_watertight",
            message: `Mesh entity "${entity.name}" is not marked watertight; it may not define a closed transport region.`,
            entityId: entity.id,
        });
    }

    if (entity.manifold === false) {
        diagnostics.push({
            level: "warning",
            code: "geometry.mesh.not_manifold",
            message: `Mesh entity "${entity.name}" is not marked manifold; transport compilation may require repair or voxelization.`,
            entityId: entity.id,
        });
    }

    validateOptionalBoundingBox(entity.boundingBox, entity.id, diagnostics);
    validateOptionalApproximateVolume(entity.approximateVolume, entity.id, diagnostics);

    return diagnostics;
}

function validateImplicitRegion(entity: TransportImplicitRegion): readonly GeometryValidationDiagnostic[] {
    const diagnostics: GeometryValidationDiagnostic[] = [];

    if (entity.expression.trim().length === 0) {
        diagnostics.push({
            level: "error",
            code: "geometry.implicit.expression.missing",
            message: `Implicit region "${entity.name}" must define an expression.`,
            entityId: entity.id,
        });
    }

    validateRequiredBoundingBox(entity.boundingBox, entity.id, diagnostics);
    validateOptionalApproximateVolume(entity.approximateVolume, entity.id, diagnostics);

    return diagnostics;
}

function validateVoxelRegion(entity: TransportVoxelRegion): readonly GeometryValidationDiagnostic[] {
    const diagnostics: GeometryValidationDiagnostic[] = [];

    if (entity.gridId.trim().length === 0) {
        diagnostics.push({
            level: "error",
            code: "geometry.voxel.grid.missing",
            message: `Voxel region "${entity.name}" must reference a voxel grid.`,
            entityId: entity.id,
        });
    }

    if (!isPositiveInteger(entity.dimensions.nx) || !isPositiveInteger(entity.dimensions.ny) || !isPositiveInteger(entity.dimensions.nz)) {
        diagnostics.push({
            level: "error",
            code: "geometry.voxel.dimensions.invalid",
            message: `Voxel region "${entity.name}" must have positive integer dimensions.`,
            entityId: entity.id,
        });
    }

    if (!isPositiveVec3(entity.voxelSize)) {
        diagnostics.push({
            level: "error",
            code: "geometry.voxel.size.invalid",
            message: `Voxel region "${entity.name}" must have a positive voxel size.`,
            entityId: entity.id,
        });
    }

    if (entity.threshold !== undefined && !Number.isFinite(entity.threshold)) {
        diagnostics.push({
            level: "error",
            code: "geometry.voxel.threshold.invalid",
            message: `Voxel region "${entity.name}" threshold must be finite when provided.`,
            entityId: entity.id,
        });
    }

    validateOptionalApproximateVolume(entity.approximateVolume, entity.id, diagnostics);

    return diagnostics;
}

function validateCsgRegion(
    entity: TransportCsgRegion,
    context: GeometryValidationContext,
): readonly GeometryValidationDiagnostic[] {
    const diagnostics: GeometryValidationDiagnostic[] = [];

    if (entity.childEntityIds.length === 0) {
        diagnostics.push({
            level: "error",
            code: "geometry.csg.children.missing",
            message: `CSG region "${entity.name}" must reference at least one child entity.`,
            entityId: entity.id,
        });
    }

    if (entity.operator === "difference" && entity.childEntityIds.length < 2) {
        diagnostics.push({
            level: "error",
            code: "geometry.csg.difference.children.invalid",
            message: `CSG difference region "${entity.name}" must reference at least two child entities.`,
            entityId: entity.id,
        });
    }

    for (const childEntityId of entity.childEntityIds) {
        if (childEntityId === entity.id) {
            diagnostics.push({
                level: "error",
                code: "geometry.csg.self_reference",
                message: `CSG region "${entity.name}" cannot reference itself as a child.`,
                entityId: entity.id,
            });
        } else if (!context.entityIds.has(childEntityId)) {
            diagnostics.push({
                level: "error",
                code: "geometry.csg.child.invalid",
                message: `CSG region "${entity.name}" references missing child entity "${childEntityId}".`,
                entityId: entity.id,
            });
        }
    }

    validateOptionalBoundingBox(entity.boundingBox, entity.id, diagnostics);
    validateOptionalApproximateVolume(entity.approximateVolume, entity.id, diagnostics);

    return diagnostics;
}

function validateRequiredBoundingBox(
    boundingBox: AxisAlignedBoundingBox,
    entityId: TransportEntityId,
    diagnostics: GeometryValidationDiagnostic[],
): void {
    if (!isValidBoundingBox(boundingBox)) {
        diagnostics.push({
            level: "error",
            code: "geometry.bounding_box.invalid",
            message: "Geometry entity has an invalid bounding box.",
            entityId,
        });
    }
}

function validateOptionalBoundingBox(
    boundingBox: AxisAlignedBoundingBox | undefined,
    entityId: TransportEntityId,
    diagnostics: GeometryValidationDiagnostic[],
): void {
    if (boundingBox !== undefined) {
        validateRequiredBoundingBox(boundingBox, entityId, diagnostics);
    }
}

function validateOptionalApproximateVolume(
    approximateVolume: number | undefined,
    entityId: TransportEntityId,
    diagnostics: GeometryValidationDiagnostic[],
): void {
    if (approximateVolume !== undefined && (!Number.isFinite(approximateVolume) || approximateVolume < 0)) {
        diagnostics.push({
            level: "error",
            code: "geometry.volume.invalid",
            message: "Approximate volume must be finite and non-negative when provided.",
            entityId,
        });
    }
}

function isValidBoundingBox(boundingBox: AxisAlignedBoundingBox): boolean {
    return isValidVec3(boundingBox.min)
        && isValidVec3(boundingBox.max)
        && boundingBox.min.x <= boundingBox.max.x
        && boundingBox.min.y <= boundingBox.max.y
        && boundingBox.min.z <= boundingBox.max.z;
}

function estimateVoxelRegionVolume(entity: TransportVoxelRegion): VolumeEstimate {
    if (entity.approximateVolume !== undefined) {
        return approximateOrUnknown(entity.approximateVolume, "voxel occupancy metadata");
    }

    if (
        isPositiveInteger(entity.dimensions.nx)
        && isPositiveInteger(entity.dimensions.ny)
        && isPositiveInteger(entity.dimensions.nz)
        && isPositiveVec3(entity.voxelSize)
        && entity.threshold === undefined
    ) {
        return exactVolume(
            entity.dimensions.nx
            * entity.dimensions.ny
            * entity.dimensions.nz
            * entity.voxelSize.x
            * entity.voxelSize.y
            * entity.voxelSize.z,
        );
    }

    return {
        kind: "unknown",
        reason: "voxel region volume depends on grid occupancy or thresholding",
    };
}

function exactVolume(value: number): VolumeEstimate {
    if (!Number.isFinite(value) || value < 0) {
        return {kind: "unknown", reason: "invalid geometric dimensions"};
    }

    return {kind: "exact", value};
}

function approximateOrUnknown(value: number | undefined, method: string): VolumeEstimate {
    if (value === undefined) {
        return {kind: "unknown", reason: `volume requires ${method}`};
    }

    if (!Number.isFinite(value) || value < 0) {
        return {kind: "unknown", reason: "invalid approximate volume metadata"};
    }

    return {kind: "approximate", value, method};
}

function dispatchGeometryOps<R>(
    entity: TransportGeometryEntity,
    fn: <K extends TransportGeometryEntity["kind"]>(
        ops: GeometryEntityOps<Extract<TransportGeometryEntity, { readonly kind: K }>>,
        entity: Extract<TransportGeometryEntity, { readonly kind: K }>,
    ) => R,
): R {
    switch (entity.kind) {
        case "box":
            return fn(geometryEntityOps.box, entity);
        case "sphere":
            return fn(geometryEntityOps.sphere, entity);
        case "cylinder":
            return fn(geometryEntityOps.cylinder, entity);
        case "mesh":
            return fn(geometryEntityOps.mesh, entity);
        case "implicit-region":
            return fn(geometryEntityOps["implicit-region"], entity);
        case "voxel-region":
            return fn(geometryEntityOps["voxel-region"], entity);
        case "csg-region":
            return fn(geometryEntityOps["csg-region"], entity);
    }
}

function isValidVec3(value: Vec3): boolean {
    return Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z);
}

function isPositiveVec3(value: Vec3): boolean {
    return isPositiveFinite(value.x) && isPositiveFinite(value.y) && isPositiveFinite(value.z);
}

function isPositiveFinite(value: number): boolean {
    return Number.isFinite(value) && value > 0;
}

function isPositiveInteger(value: number): boolean {
    return Number.isInteger(value) && value > 0;
}