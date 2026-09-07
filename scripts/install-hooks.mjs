import { execFile } from "node:child_process";
import { promisify } from "node:util";

/** Installs the repository hooks. A missing git checkout is not an error. */
try {
  await promisify(execFile)("git", ["config", "core.hooksPath", ".githooks"]);
  console.log("Git hooks installed from .githooks.");
} catch {
  /* Not a git checkout, or git is unavailable; hooks are optional. */
}
