# React Surgeon build result

Validated on 7 September 2026 in `D:\React Agent`.

## Result

Working MVP, including a real local-model Click → Source → Patch → Static checks → Browser replay → VERIFIED workflow. No demo filename or fix is hardcoded in the agent. The integration harness identifies the demo button, while Qwen chooses the actual code change.

| Acceptance check                                 | Result                                                                                                                  |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| npm dependencies                                 | Installed; npm audit reported zero vulnerabilities                                                                      |
| TypeScript strict typecheck                      | Passed                                                                                                                  |
| ESLint                                           | Passed                                                                                                                  |
| Unit tests                                       | 22 passed                                                                                                               |
| Workspace build                                  | Passed                                                                                                                  |
| React detection, AST, hooks, import graph        | Implemented and tested                                                                                                  |
| Dev source metadata and click suppression        | Passed in Chromium                                                                                                      |
| Overlay hover and authenticated localhost bridge | Passed in Chromium                                                                                                      |
| Reproduction recorder                            | Recorded and delivered a cart click                                                                                     |
| llama.cpp CPU provider                           | Installed executable discovered and used                                                                                |
| Qwen Q4_K_M / 4096 context                       | Downloaded; real JSON inference test passed                                                                             |
| Agent patch and undo                             | Real Qwen patch verified; demo restored with undo                                                                       |
| Demo typecheck / lint / tests / build            | All passed after model patch                                                                                            |
| Browser replay                                   | Three assertions passed; no console, page or request errors                                                             |
| Assertion-free replay                            | Correctly rejected                                                                                                      |
| Production instrumentation                       | Absent from production bundle                                                                                           |
| Proof persistence                                | JSON evidence saved to dist/integration-proof.json                                                                      |
| CLI scan / X-Ray / model lifecycle               | Exercised successfully                                                                                                  |
| Model stop                                       | Authenticated control request stopped the owned process                                                                 |
| VSIX                                             | Packaged with its required Playwright runtime                                                                           |
| Packaged extension smoke test                    | Extracted archive, activated using a VS Code API stub, checked commands/sidebar CSP, launched packaged Chromium runtime |
| Actual VS Code GUI walkthrough                   | Not performed; install the VSIX to exercise the panel interactively                                                     |
| Documentation                                    | README, demo, architecture, agent, security, development and this report                                                |

## Machine and installations

Windows x64, 12 logical CPU cores, 7.68 GB physical RAM. Free RAM at preflight was approximately 1.49 GB. Existing Node v24.19.0, npm 11.17.0, Git 2.55.0, VS Code 1.135.0 and llama.cpp build 10819 were reused. Project npm dependencies, Chromium/headless shell and the approximately 1.04 GiB Qwen GGUF were downloaded.

A loaded idle Qwen process measured approximately 1186.7 MiB working set and 1347 MiB private memory. These are one-time observations, not peak measurements or a guarantee for every 6 GB computer. The scheduler stops inference before static checks and before browser launch. Chromium is fresh and closed after each replay.

## Evidence and artifacts

- `dist/react-surgeon-0.1.0.vsix`
- `dist/integration-proof.json`
- `dist/demo-preview.png`
- `examples/buggy-react-app/.react-surgeon/proofs/`

The final model-generated cart patch changed `setCount(count + 2)` to `setCount(count + 1)`. Browser assertions checked initial count 0 and counts 1 and 2 after successive clicks. The demo was deliberately restored after verification; historical proof describes the patched state.

## Scope limitations

No environment blocker remains for the demonstrated workflow. This is an MVP, not every possible advanced feature in the specification: acceptance scenarios are user supplied; X-Ray is text; complex aliases, wrappers and provider relationships are not fully resolved; recorder coverage is limited to clicks, changed inputs, submit and back/forward navigation; optional arbitrary file creation/deletion tools are not exposed. npm runs project scripts even when another lockfile manager is detected. The README details these limits.

Use `npm run demo` in one terminal and `npm run surgeon -- --project examples/buggy-react-app start` in another. Open the printed session URL, select the button, and follow the README's fix command or install the VSIX.
