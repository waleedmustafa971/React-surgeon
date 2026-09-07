# @react-surgeon/core

The engine behind [React Surgeon](https://github.com/waleedmustafa971/React-surgeon): project detection, Babel component and import analysis, the bounded repair agent, the local llama.cpp model provider, exact-match patching with undo, and the verification pipeline that runs static checks and replays a Playwright acceptance scenario.

Most people want [`@react-surgeon/cli`](https://www.npmjs.com/package/@react-surgeon/cli) instead. Use this package to embed the agent in your own tooling.

```ts
import { Agent, LlamaCppProvider, config } from "@react-surgeon/core";

const settings = await config(root);
const proof = await new Agent(
  root,
  new LlamaCppProvider(root, settings.model),
).fix("Each click should add one item", scenario);
console.log(proof.status); // "VERIFIED" | "BLOCKED"
```

`VERIFIED` requires a successful build, no failed static checks, a passing browser replay with at least one assertion, and no console, page or request errors. Anything else is `BLOCKED`, and the attempted patch is left on disk for review — `PatchEngine.undo()` restores the originals.

Full documentation is in the [project README](https://github.com/waleedmustafa971/React-surgeon#readme).

MIT
