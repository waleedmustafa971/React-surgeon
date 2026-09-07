<p align="center">
  <img src="https://raw.githubusercontent.com/waleedmustafa971/React-surgeon/main/assets/branding/react-surgeon-logo-v1.png" alt="React Surgeon" width="300">
</p>

<h1 align="center">React Surgeon</h1>

<p align="center"><strong>Click a bug. Watch it get diagnosed, fixed, and verified.</strong></p>

---

React Surgeon closes the loop between _seeing_ a bug in your running React app and _proving_ it is gone.

Click the broken element in your browser. The extension tells you which file and line rendered it, a local model proposes a minimal fix, and then the fix has to earn the label: typecheck, lint, tests, a production build, and a replay of your acceptance scenario in a real browser. If any of that fails, it refuses to call the change fixed and leaves the diff for you to review.

<p align="center">
  <img src="https://raw.githubusercontent.com/waleedmustafa971/React-surgeon/main/assets/media/select-element.gif" alt="Clicking Add to Cart adds two items instead of one; selecting the button reports src/components/ProductCard.tsx:19" width="760">
</p>

<p align="center"><em>One click adds two. Selecting the button reports the exact JSX that rendered it, without firing the app's own handler.</em></p>

## Why this is different

A patch can pass typecheck, lint, tests **and** a production build and still be completely wrong. During development one did exactly that: it set state back to the previous array reference, React bailed out on `Object.is`, and nothing re-rendered. Four green checks on a broken fix. Only the browser replay caught it.

So the model's opinion does not count here. **`VERIFIED` requires** a successful production build, no failed static checks, a passing browser replay with at least one assertion, and no console, page or request errors. Anything else is `BLOCKED`.

It also refuses to run when your acceptance scenario already passes against the unmodified app, so it cannot invent a reproduction to look useful.

## What you get

- **Click-to-source.** Hover and click any element to jump to the JSX that rendered it.
- **Bounded repair.** Exact-match edits to a unique existing substring, never a file rewrite.
- **Proof files.** Every run writes JSON containing the original failure, the exact diff, every check result and every browser assertion.
- **Undo.** A blocked run leaves the patch on disk for review, with one command to restore.
- **X-Ray.** Components, hooks and relationships as a graph.

## Requirements

- Node.js 22.12+ and npm on your machine
- A React project using [`@react-surgeon/vite-plugin`](https://www.npmjs.com/package/@react-surgeon/vite-plugin)
- Workspace trust, since verification runs your project's own scripts

### Choosing a model provider

**The extension cannot use the bundled `node-llama-cpp` runtime.** That package is a platform-specific native binary, so embedding it would make each VSIX installable on exactly one operating system. Set `model.provider` in `.react-surgeon/config.json` to one of:

- `llama.cpp` — a `llama-server` on your `PATH` ([releases](https://github.com/ggml-org/llama.cpp/releases), or `winget install ggml.llamacpp`)
- `openai-compatible` — an Ollama or LM Studio server you already run

```json
{
  "model": {
    "provider": "openai-compatible",
    "baseURL": "http://127.0.0.1:11434/v1",
    "model": "qwen2.5-coder:1.5b"
  }
}
```

The endpoint must be loopback unless you explicitly set `model.allowRemote`, so inference stays on your machine by default. The [command line tool](https://www.npmjs.com/package/@react-surgeon/cli) has no such limitation and ships the runtime with npm.

## Getting started

1. Install [`@react-surgeon/vite-plugin`](https://www.npmjs.com/package/@react-surgeon/vite-plugin) in your app and add `surgeon()` before the React plugin.
2. Start your dev server.
3. Open the React Surgeon activity bar and choose **Connect project**.
4. **Select UI element**, describe the bug, then **Diagnose & Fix** and pick an acceptance scenario.

Commands: Doctor, Start, Stop, Start Local Model, Select UI Element, Diagnose Selected Element, Verify Current Fix, Open X-Ray, Show Proof, Show Logs.

## Honest limitations

This is an MVP, not production-grade autonomous repair. **Review every diff.**

- The 1.5B default model solves roughly half the bugs it attempts on the demo app and refuses the rest rather than guessing.
- Analysis resolves ordinary relative imports. Path aliases, higher-order components, re-exports and provider chains may need manual context.
- You write the acceptance scenario. The CLI can draft one from a recorded interaction, but you decide what correct means.
- Use it only with projects you trust: verification executes your package scripts.

## Links

[Source and documentation](https://github.com/waleedmustafa971/React-surgeon) · [CLI on npm](https://www.npmjs.com/package/@react-surgeon/cli) · [Vite plugin](https://www.npmjs.com/package/@react-surgeon/vite-plugin) · [Report an issue](https://github.com/waleedmustafa971/React-surgeon/issues)

MIT licensed.
