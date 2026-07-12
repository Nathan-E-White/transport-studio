#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { CARGO_CACHES } from "./hygiene-lib.mjs";

const [role, command, ...args] = process.argv.slice(2);
if (!(role in CARGO_CACHES) || !command) throw new Error("usage: cargo-target.mjs <dev|build|test> <command> [args...]");
const result = spawnSync(command, args, { stdio: "inherit", env: { ...process.env, CARGO_TARGET_DIR: CARGO_CACHES[role] } });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
