import { build } from "esbuild";
import { mkdir, copyFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
await mkdir("dist", { recursive: true });
await build({
  entryPoints: ["packages/vscode/src/extension.ts"],
  outfile: "packages/vscode/dist/extension.cjs",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  external: ["vscode"],
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
await writeFile(
  "packages/vscode/README.md",
  "# React Surgeon\n\nClick a bug. Diagnose, fix, and verify React applications locally.\n\nRequires Node.js 22.12+, npm, llama.cpp on PATH, and a trusted React/Vite workspace with the React Surgeon Vite plugin installed. Run the application, choose Connect project in the React Surgeon sidebar, select an element, describe its bug, and supply a JSON acceptance scenario. Qwen inference stays local; the model stops before Chromium verification. The first run downloads model weights.\n\nCommands include Doctor, Start, Stop, Start Local Model, Select UI Element, Diagnose Selected Element, Verify Current Fix, Open X-Ray, Show Proof, and Show Logs. Proof files are stored in .react-surgeon/proofs. This is an MVP: review generated patches and use trusted projects only.\n",
);
await copyFile("LICENSE", "packages/vscode/LICENSE");
const r = spawnSync(
  process.execPath,
  [
    "../../node_modules/@vscode/vsce/vsce",
    "package",
    "--no-dependencies",
    "--allow-missing-repository",
    "--out",
    "../../dist/react-surgeon-0.1.0.vsix",
  ],
  { cwd: "packages/vscode", stdio: "inherit", windowsHide: true },
);
process.exitCode = r.status ?? 1;
