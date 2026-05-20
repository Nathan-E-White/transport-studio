# ADR 0003: Editor Scene vs Transport Problem


# ADR 0003: Editor Scene vs Transport Problem

## Status

Accepted.

## Context

The application needs to support an interactive, game-engine-like authoring workflow for Monte Carlo particle transport problems while preserving a clean path toward rigorous simulation backends.

The frontend editor should feel fluid and forgiving. Users need to create, select, move, inspect, hide, and revise geometry, sources, tallies, materials, visual overlays, and sampled particle tracks. That representation will naturally contain UI concerns such as selected entities, temporary handles, draft edits, labels, viewport state, helper gizmos, visibility flags, and partially valid objects.

The transport backend needs a different representation. A backend-facing transport problem should be validated, deterministic, explicit, and free of editor-only state. It should describe only the information required to run or prepare a simulation: geometry, materials, sources, tallies, run settings, boundary conditions, and relevant metadata.

Rendering is also a separate concern. Three.js / React Three Fiber objects should not become the canonical domain model. Renderer objects are optimized for drawing, selection, highlighting, animation, and interaction; they should be derived from editor or simulation state rather than treated as the authoritative simulation input.

Without a deliberate boundary, the app risks coupling UI convenience, visual rendering, and physics input into a single mutable object graph. That would make testing harder, make backend integration brittle, and make it difficult to support multiple backends or import/export formats later.

## Decision

We will maintain three distinct representations:

1. **Editor Scene**
   - The user-facing, interactive authoring model.
   - May contain incomplete, draft, selected, hidden, highlighted, or visually annotated entities.
   - Optimized for ergonomic editing, inspection, undo/redo, and project-tree interaction.

2. **Transport Problem**
   - The backend-facing simulation model.
   - Must be validated, explicit, deterministic, and free of editor-only concerns.
   - Produced by compiling an `EditorScene` through a validation and normalization step.

3. **Render Scene / View Model**
   - The visualization-facing model consumed by React Three Fiber / Three.js components.
   - Derived from the editor scene, transport results, display settings, and current selection.
   - May include meshes, colors, outlines, gizmos, overlays, labels, and sampled tracks.

The central boundary is:

```ts
function compileEditorScene(scene: EditorScene): CompileResult<TransportProblem>;
```

The compiler is responsible for converting the forgiving editor representation into a strict transport representation. It should validate entity references, normalize units, resolve material assignments, reject incomplete source/tally definitions, and produce actionable diagnostics.

The renderer should not compile transport problems directly. It should consume render-oriented view models derived from editor and result state.

## Initial Type Shape

The exact types will evolve, but the first implementation should roughly follow this separation:

```ts
export interface EditorScene {
  id: string;
  name: string;
  entities: EditorEntity[];
  materials: EditorMaterial[];
  sources: EditorSource[];
  tallies: EditorTally[];
  settings: EditorRunSettings;
}

export type EditorEntity =
  | EditorBox
  | EditorSphere
  | EditorCylinder
  | EditorMeshImport;

export interface EditorEntityBase {
  id: string;
  name: string;
  transform: EditorTransform;
  materialId?: string;
  visible: boolean;
  locked: boolean;
  tags?: string[];
}

export interface TransportProblem {
  id: string;
  geometry: TransportGeometry;
  materials: TransportMaterial[];
  sources: TransportSource[];
  tallies: TransportTally[];
  settings: TransportRunSettings;
}

export interface CompileResult<T> {
  ok: boolean;
  value?: T;
  diagnostics: CompileDiagnostic[];
}

export interface CompileDiagnostic {
  level: "info" | "warning" | "error";
  code: string;
  message: string;
  entityId?: string;
}
```

A rough dataflow is:

```txt
User edits
  -> EditorScene
  -> validation / normalization / compilation
  -> TransportProblem
  -> backend run
  -> transport events and results
  -> render/view models
  -> viewport, inspector, tallies, diagnostics
```

## Consequences

### Positive

- The frontend can support rich editing without forcing every intermediate state to be physically valid.
- Backend integrations receive a cleaner and more stable input model.
- Validation errors can be surfaced explicitly in the UI instead of appearing as backend failures.
- Multiple backends can eventually be supported by compiling the same editor scene into different backend-specific forms.
- Renderer code remains visual and interactive rather than becoming the physics domain model.
- Tests can target the compiler boundary directly: editor scene in, diagnostics and transport problem out.

### Negative

- There is more upfront type and conversion code.
- Some concepts may initially feel duplicated between editor, transport, and render layers.
- The compiler boundary must be maintained carefully as the domain grows.
- Debugging can require checking which layer owns a given piece of state.

### Neutral / Accepted Tradeoffs

- Some editor entities may not have a one-to-one transport equivalent.
- Some transport entities may be generated by compilation rather than directly authored by the user.
- The first compiler may be intentionally simple, but it should still establish the architectural seam.

## Validation Rules

The compiler should eventually validate at least the following:

- Every referenced material exists.
- Every source has a valid particle type, position/direction distribution, and energy distribution.
- Every tally references valid geometry, regions, surfaces, or detector definitions.
- Geometry entities have valid dimensions and transforms.
- Units are normalized before reaching the backend.
- Entity IDs are stable and unique.
- Unsupported or incomplete editor entities produce diagnostics rather than silent failures.

## Implementation Notes

- Keep `EditorScene` types in an editor/domain package, not inside React components.
- Keep `TransportProblem` types in a transport/domain package that does not import React, Three.js, or UI code.
- Keep Three.js objects as derived render artifacts, not stored canonical entities.
- Prefer pure functions for compilation and validation.
- Make compiler diagnostics first-class so the inspector and diagnostics panel can explain what is wrong.
- Treat import/export formats as adapters around the editor or transport model, not as the core model itself.

## Open Questions

- Should the first backend target a generic internal transport format, or should it compile toward one concrete backend schema first?
- How much unit handling belongs in the editor model versus the compiler?
- Should constructive solid geometry be represented directly in the editor, or introduced later as a compiled geometry feature?
- How should imported CAD/mesh geometry be simplified or constrained for early transport runs?
- Where should undo/redo history live relative to the `EditorScene` model?