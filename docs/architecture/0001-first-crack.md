# ADR 0001: First Crack Architecture

## Decision

Transport Studio is an editor-first Monte Carlo transport workbench.

The UI owns authoring ergonomics and visualization. The transport engine consumes compiled, validated simulation problems and streams results back to the UI.

## Non-negotiable separations

1. Editable scene is not the simulation problem.
2. Render scene is not the transport geometry.
3. Track visualization is not the tally truth.
4. Data packs are optional assets, not core app dependencies.
5. Backends are plugins behind a stable protocol.

## First backend

The first backend is `transport-visual`: a toy TypeScript photon transport stub optimized for rapid visual feedback.

It is deliberately not the serious physics backend.

## Future backends

- Web Worker TypeScript backend
- WebGPU backend
- Native Rust/C++ CPU backend
- Native CUDA/HIP/Kokkos/SYCL backend
- Remote/HPC backend

## UX target

Game engine editor with science CAD flavor.
