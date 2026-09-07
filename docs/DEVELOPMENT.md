# Development

From the repository root, run `npm install`, then `npm run build`. The build emits each workspace's dist entry. `npm run typecheck`, `npm run lint`, and `npm test` are the normal checks. Unit tests use isolated temporary folders and one Vitest worker to limit memory use.

Run `npx playwright install chromium` once. `npm run test:integration` requires llama.cpp and the Qwen cache. It uses the actual local model, not a mock or hardcoded fix. It checks selection suppression, source mapping, model repair, build/lint/tests and runtime assertions. It restores the demo defect after a successful test and copies proof to dist.

Use `npm run demo` for interactive work. The demo has separate typecheck, lint, unit test and build scripts, so the agent verifies the target application, not just its own code.

`npm run package:vscode` bundles the extension and core with esbuild, ships Playwright's dynamically loaded runtime intact, then uses official @vscode/vsce tooling. Install dist/react-surgeon-0.1.0.vsix with the code CLI or the Extensions menu. The extension requires Node/npm/llama.cpp on the host; these are not embedded in the VSIX.

Windows execution policies or managed sandboxes may prevent child processes, downloads, or cache writes. Use the environment's explicit approval mechanism; do not bypass it. Scripts hide spawned windows and clean up owned process trees. If llama.cpp is already on PATH, no system installation is needed.

External API references: [Vite plugin API](https://vite.dev/guide/api-plugin), [llama.cpp server](https://github.com/ggml-org/llama.cpp/tree/master/tools/server), [Playwright](https://playwright.dev/docs/api/class-page), [VS Code extension API](https://code.visualstudio.com/api).
