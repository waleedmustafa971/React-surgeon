# Agent

1. Detect React from package.json and scan source with Babel.
2. Run the user-supplied acceptance scenario on the original app.
3. Select source context using UI location, imports, related components and task words.
4. Ask the local model for one action: semantic read/search tool, minimal exact replacement, or completion/diagnosis.
5. Validate JSON strictly; permit one malformed-format retry.
6. Apply only a unique exact match to a JS/TS/JSX/TSX/CSS file, persisting originals first.
7. Stop inference, run available static checks, then replay the same browser scenario.
8. Persist proof; return VERIFIED only if the checks and assertions pass.
9. Otherwise narrow context around the compact failure, up to four repair cycles and twelve total actions.

Repeated identical actions are blocked. Failed edits do not replace whole files. Undo restores the session's original files, including their original line endings. The model cannot execute arbitrary commands or choose a script name outside the verifier's allowlist.

The default 4096-token window reserves a modest generation allowance. Context uses a conservative character budget, not a perfect tokenizer; unusually token-dense text may still exhaust the server context. Source is prioritized before peripheral files. No conversation history or full repository is sent.

Completion text from the model is never treated as proof. User-authored scenarios are the acceptance contract. Automatic generation of acceptance criteria and tests remains future work.
