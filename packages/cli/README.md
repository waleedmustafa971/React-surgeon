# @react-surgeon/cli

Click a bug. Diagnose, fix, and verify React applications locally.

The command line for [React Surgeon](https://github.com/waleedmustafa971/React-surgeon) — a local, React-specific repair agent. A dev-only Vite plugin maps clicked DOM elements to JSX source, Babel analysis narrows the context for a local Qwen Coder model, and a bounded agent applies exact minimal edits. Static checks and a Playwright acceptance scenario decide whether a change is verified.

No cloud, no API keys, no telemetry. CPU inference only.

```bash
npm install -g @react-surgeon/cli
react-surgeon doctor
react-surgeon --project ./my-app fix "Each click should add one item" --scenario scenarios/cart.json
```

Requires Node.js 22.12+, llama.cpp on `PATH`, and a React project using [`@react-surgeon/vite-plugin`](https://www.npmjs.com/package/@react-surgeon/vite-plugin).

Full documentation, the CLI reference, the acceptance-scenario schema and the security boundaries are in the [project README](https://github.com/waleedmustafa971/React-surgeon#readme).

MIT
