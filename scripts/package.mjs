import { build } from "esbuild";
import { mkdir, copyFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const { version } = JSON.parse(
  await readFile("packages/vscode/package.json", "utf8"),
);
await mkdir("dist", { recursive: true });
await build({
  entryPoints: ["packages/vscode/src/extension.ts"],
  outfile: "packages/vscode/dist/extension.cjs",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  // node-llama-cpp is a platform-specific native binary using top-level
  // await: bundling it breaks the CJS build and would make the VSIX
  // installable on only one OS. It stays a runtime import.
  external: ["vscode", "node-llama-cpp", "@node-llama-cpp/*"],
  plugins: [
    {
      name: "ship-playwright-runtime",
      setup(b) {
        b.onResolve({ filter: /^playwright-core$/ }, () => ({
          path: "../runtime/playwright-core/index.js",
          external: true,
        }));
      },
    },
  ],
  define: { "import.meta.url": "__surgeonImportMetaUrl" },
  banner: {
    js: "const __surgeonImportMetaUrl = require('url').pathToFileURL(__filename).href;",
  },
});
// Playwright dynamically loads driver assets; ship the official packages intact.
const { cp } = await import("node:fs/promises");
await mkdir("packages/vscode/runtime", { recursive: true });
for (const name of ["playwright-core"])
  await cp(`node_modules/${name}`, `packages/vscode/runtime/${name}`, {
    recursive: true,
  });
// packages/vscode/README.md is the Marketplace listing page, so it is a real
// committed file rather than a string literal generated here.
await copyFile("LICENSE", "packages/vscode/LICENSE");
const r = spawnSync(
  process.execPath,
  [
    "../../node_modules/@vscode/vsce/vsce",
    "package",
    "--no-dependencies",
    "--allow-missing-repository",
    "--out",
    `../../dist/react-surgeon-${version}.vsix`,
  ],
  { cwd: "packages/vscode", stdio: "inherit", windowsHide: true },
);
process.exitCode = r.status ?? 1;
