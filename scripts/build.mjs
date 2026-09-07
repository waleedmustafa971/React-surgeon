import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
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
