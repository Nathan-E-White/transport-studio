# Third-Party Notices

## Mathematical verification gateway

Transport Studio presently acts as an integration gateway to the Symbolica and
Numerica Rust crates. Their types are kept behind Transport Studio's public
Verification API, but use of the upstream software remains subject to its own
terms.

Symbolica is subject to the license and usage terms published by its upstream
authors. This project does not grant a sublicense, make a warranty about those
terms, or represent that a particular use is permitted. End users are
responsible for obtaining any rights they require and use this integration at
their own risk until the licensing position is fully settled.

Transport Studio does not store or log Symbolica license keys. A missing,
rejected, or restricted license state is reported only as a stable diagnostic
and non-secret provenance value.

The gateway uses Symbolica and Numerica 2.1.0 with their default features
disabled and their `no_gmp` features enabled. It does not enable Symbolica JIT,
native code generation, CUDA, dynamic-library generation, Python bindings, or
Wolfram bindings.
