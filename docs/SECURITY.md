# Security boundaries

Use React Surgeon only with trusted local projects. It is an MVP and is not an operating-system sandbox.

Model-facing source paths are canonicalized inside the selected workspace. Absolute paths, traversal, paths through escaping symlinks/junctions, .env variants, SSH material, common credential paths, node_modules, and build output are blocked. Search skips symlinks and hidden directories. Exact patching is restricted to React source and CSS. The model cannot modify package scripts or install dependencies.

The verifier runs only predetermined npm script categories: typecheck, lint, test, build and Vite dev. A package script can itself run arbitrary code; an allowlisted script name does not make an untrusted repository safe. VS Code workspace trust is required.

The source bridge binds 127.0.0.1, requires a random session token and validates the application's origin. The browser receives only relative source paths. Session URLs contain a local capability: do not share them. The overlay removes it from the URL after reading it and stores it in tab session storage. The model server also binds 127.0.0.1. Neither service opens firewall ports.

Core inference stays local. Initial npm packages, browser binaries and GGUF weights are downloaded from their distribution servers. Once cached, coding and verification need no hosted AI service. There is no telemetry.

Model context and command summaries redact common secret assignments and token patterns; this is heuristic. Do not put production credentials in source or scenarios. Password inputs are recorded as [REDACTED]. Proofs can contain source diffs and supplied scenario input, so treat `.react-surgeon` as private workspace data.

Playwright requests and navigations are restricted to localhost, and it uses a fresh nonpersistent browser context. Password stores and personal browser profiles are not opened. Browser processes are closed after replay; Windows child process trees use taskkill for owned PIDs only.

Known limitations: localhost services are not isolation from other processes running as the same user; configuration and proof storage assume the local workspace is trusted; hardcoded secrets may evade redaction; browser protocol limits do not replace a network sandbox; static analysis is heuristic. Review diffs before committing or deploying. No commits, pushes, deployments, cloud calls, arbitrary shell tools, or filesystem deletion tools are exposed to the model.
