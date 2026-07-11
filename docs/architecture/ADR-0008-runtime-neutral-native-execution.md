# ADR 0008: Runtime-Neutral Native Execution

## Status

Accepted for the architecture deepening plan.

## Context

Transport Studio has a working prototype split between a React workbench, TypeScript domain packages, a TypeScript transport worker boundary, and Rust crates under the current Tauri desktop shell.

ADR 0001 established that Editable Scene state compiles into a backend-facing transport problem before execution. ADR 0002 left the native/Tauri bridge intentionally stubbed during the first UI shell pass. ADR 0003 separated editor state from compiled transport problem state. ADR 0007 kept product-facing solver promotion gated until capability metadata, diagnostics, validation evidence, and UI copy move together.

The app now has enough native wiring to make the next boundary choice matter. If run orchestration, capability facts, or compiled problem semantics move into Tauri-specific code, the stack becomes harder to use from browser-only development, future remote/HPC backends, tests, or non-Tauri native shells.

## Decision

Treat Tauri as the current native runtime adapter, not as the center of the Transport Studio stack.

Run orchestration, Run Session outcomes, solver Capability Status, Compiled Problem Inclusion, and Compiled Transport Problem semantics must stay runtime-neutral. They may accept adapters for native execution, but they must not import Tauri APIs or depend on Tauri launch behavior.

Tauri-specific code may:

- expose desktop commands;
- translate between Tauri IPC payloads and runtime-neutral contracts;
- provide a native bridge adapter to frontend/domain code;
- own desktop launch configuration such as dev server startup and webview loading.

Tauri-specific code must not:

- define domain meanings for compile inclusion, run sessions, or solver capability status;
- become the only source of truth for native backend contracts;
- make TypeScript domain validation or Rust engine behavior depend on desktop launch semantics;
- promote gated solver behavior by virtue of a native command existing.

## Consequences

- Browser-only development can continue to surface bridge-unavailable diagnostics without pretending native execution is wired.
- Tests can exercise run orchestration and capability contracts without starting Tauri.
- Future runtimes can reuse the same contracts through their own adapters.
- Tauri remains useful for desktop packaging and IPC, but domain and engine boundaries remain portable.
- More adapter code may exist at the edge, but that duplication protects the deeper contract.

## TDD Guidance

Tests should target runtime-neutral seams first:

- compile behavior through editor/project mutation functions and `compileEditorScene`;
- run outcomes through a Run Session module with injected bridge adapters;
- solver capability facts through shared contract fixtures;
- engine behavior through the public `transport-engine` facade.

Tauri-specific tests should verify adapter translation only. They should not become the primary proof for domain or engine behavior.

## Non-Goals

- Do not remove Tauri.
- Do not replace the current native photon smoke bridge.
- Do not redesign packaging, signing, or desktop distribution.
- Do not promote gated solvers to runnable status.
- Do not make browser-only mode execute native Rust code.

## Related Decisions And Notes

- [ADR 0001: First Crack Architecture](ADR-0001.md)
- [ADR 0002: Front-End Beef-Up](ADR-0002.md)
- [ADR 0003: Front-End State Model and Editor Domain Boundary](ADR-0003.md)
- [ADR 0007: Staged Relativistic Multiphysics Kernel Promotion](ADR-0007.md)
- [Architecture Deepening Research](architecture-deepening-research.md)

