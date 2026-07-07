

┌─────────────────────────────────────────────────────────────┐
│ Top bar: Project | Physics Mode | Run | Compare | Export    │
├───────────────┬─────────────────────────────┬───────────────┤
│ Object Tree   │ 3D/2D Simulation Canvas     │ Inspector     │
│               │                             │               │
│ Experiment    │ geometry, mesh, fields,     │ selected      │
│ ├ Regions     │ particles/rays, shocks,     │ object props  │
│ ├ Materials   │ probes, opacity overlays    │ equations     │
│ ├ Sources     │                             │ validation    │
│ ├ BCs         │                             │               │
│ └ Diagnostics │                             │               │
├───────────────┴─────────────────────────────┴───────────────┤
│ Timeline | Run log | Field plots | Probe traces | Warnings  │
└─────────────────────────────────────────────────────────────┘

**Essential modules

1. Geometry / target designer

Objects should be scientific entities, not just meshes
```typescript
type RegionKind =
  | "vacuum"
  | "gas"
  | "solid"
  | "foam"
  | "shell"
  | "capsule"
  | "hohlraum"
  | "foil"
  | "ablator"
  | "tamper"
  | "diagnostic-window";
```

With primitives such as:
Sphere
Cylinder
Slab
Shell
Cone
Annulus
Capsule
Hohlraum
MeshImport
ImplicitSurface
CSGRegion


2. Material model

Each region gets:

```typescript
interface MaterialModel {
  id: string;
  name: string;
  composition: NuclideOrElementFraction[];
  density: FieldExpr;
  temperature?: FieldExpr;
  eos: EOSRef;
  opacity: OpacityRef;
  strength?: StrengthModelRef;
}
```

Important: support tabular physics early, even if mocked:

EOS table
opacity table
ionization model
multi-group opacity
Planck/Rosseland means


3. Radiation model
```typescript
type RadiationTransportMode =
  | "none"
  | "gray-diffusion"
  | "multigroup-diffusion"
  | "flux-limited-diffusion"
  | "discrete-ordinates"
  | "implicit-monte-carlo"
  | "hybrid";
```
Modes:

4. Hydro model

```typescript
type HydroMode =
  | "none"
  | "lagrangian"
  | "eulerian"
  | "ALE"
  | "SPH"
  | "AMR-eulerian";
```

5. Coupling graph

This is the baller part.

Let users build the physics coupling as a visual graph:

Radiation Energy
↓
Material Temperature
↓
EOS Pressure
↓
Hydrodynamic Motion
↓
Density / Opacity Update
↺

Node Examples:
RadiationTransportStep
HydroStep
EOSUpdate
OpacityUpdate
ElectronIonCoupling
LaserDeposition
ConductiveHeatTransfer
ArtificialViscosity
AMRRegrid


First MVP

Do not start with real rad-hydro solving.

Start with a professional fake-but-structured workbench:

MVP 1:
- React TypeScript app
- 2D/3D target designer
- object tree
- material assignment
- radiation source placement
- boundary condition editor
- probe/diagnostic placement
- mock field visualization
- export JSON problem spec


export format:

```json
{
  "experiment": {
    "name": "Marshak Wave Demo",
    "dimension": "1D/2D/3D",
    "geometry": [],
    "materials": [],
    "radiation": {},
    "hydro": {},
    "coupling": {},
    "diagnostics": [],
    "run": {}
  }
}
```


package structure:
rad-hydro-workbench/
apps/
workbench/
packages/
domain/
geometry/
materials/
radiation/
hydro/
coupling/
diagnostics/
visualization/
validation/
io/


Killer feature

A physics-aware inspector.

Click a region and see:
Region: CH Ablator
Density: 1.05 g/cc
EOS: SESAME-like table
Opacity: multigroup table
Initial T: 300 K
Radiation coupling: enabled
Hydro: moving material
Warnings:
- opacity table missing above 2 keV
- mesh resolution may underresolve ablation front


Development path

Start here:
1. Domain model
2. JSON schema
3. 2D scene editor
4. Region/material/source editors
5. Mock fields
6. Diagnostics/probes
7. Export/import
8. Plug-in solver backend later

