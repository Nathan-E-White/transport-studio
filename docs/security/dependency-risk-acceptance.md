# Dependency Risk Acceptance

## `glib` `GHSA-wrw7-89jp-8q8g`

**Status:** Temporarily accepted transitive risk

**Reviewed:** 2026-07-19

Transport Studio's Rust lockfile contains `glib` 0.18.5 through the Linux GTK 3
dependency chain owned by Tauri 2.11.2, `tauri-runtime-wry` 2.11.2, Wry 0.55.1,
and Tao 0.35.3. Those current upstream releases require GTK 3 bindings from
the `0.18` line, while the advisory's first patched `glib` release is 0.20.0.
Cargo cannot update `glib` across that incompatible dependency boundary by
itself.

The advisory concerns undefined behavior in `glib::VariantStrIter`. Transport
Studio does not depend on `glib` directly and neither its native code nor the
resolved Tauri, Wry, or Tao sources call `VariantStrIter`. The vulnerable crate
is target-specific to Linux and other GTK-backed desktop targets; it is absent
from the current macOS dependency graph.

Replacing Tauri, patching the GTK binding stack, or carrying a private fork
would introduce more compatibility and maintenance risk than this presently
unreached API. The Dependabot alert may therefore be dismissed as tolerable
risk while this constraint holds.

Reopen the decision when any of the following occurs:

- Tauri and Wry move their Linux runtime to GTK bindings compatible with
  `glib` 0.20 or newer;
- Transport Studio or an upstream runtime begins using `VariantStrIter`;
- Linux packaging becomes a supported release target; or
- the advisory severity, affected surface, or exploit evidence changes.

This acceptance does not classify the crate as fixed. It records why a normal
dependency update cannot currently remove it and the conditions that end the
exception.
