import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createRequire } from "node:module";
for (const name of ["shared", "core", "vite-plugin", "cli", "vscode"]) {
  await mkdir(`packages/${name}/dist`, { recursive: true });
  await build({
    entryPoints: [
      `packages/${name}/src/${name === "vscode" ? "extension" : "index"}.ts`,
    ],
    outfile: `packages/${name}/dist/${name === "vscode" ? "extension.cjs" : "index.js"}`,
    bundle: true,
    platform: "node",
    target: "node22",
    format: name === "vscode" ? "cjs" : "esm",
    packages: "external",
    external: ["vscode"],
    sourcemap: true,
    ...(name === "vscode"
      ? {
          define: { "import.meta.url": "__surgeonImportMetaUrl" },
          banner: {
            js: "const __surgeonImportMetaUrl = require('url').pathToFileURL(__filename).href;",
          },
        }
      : {}),
  });
}

/**
 * Published packages need type declarations. esbuild only emits JavaScript, so
 * tsc runs per package with the workspace path aliases disabled: that keeps
 * `@react-surgeon/shared` a package reference in the emitted .d.ts instead of
 * inlining a path outside the package's rootDir. Order matters — a dependent
 * package resolves its dependency's freshly written declarations.
 */
const tsc = createRequire(import.meta.url).resolve("typescript/bin/tsc");
for (const name of ["shared", "core", "vite-plugin"])
  await promisify(execFile)(process.execPath, [
    tsc,
    "-p",
    `packages/${name}/tsconfig.build.json`,
  ]);
