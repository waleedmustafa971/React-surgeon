# Repeatable demo bugs

Start with `npm run demo`. Connect using `npm run surgeon -- --project examples/buggy-react-app start` and open its printed URL.

| Bug | Select | Expected | Scenario |
| --- | --- | --- | --- |
| Counter | Add to Cart | One item per click; initial code adds two | scenarios/cart.json |
| Login redirect | Sign in | Navigate to /dashboard; initial code navigates to /login | scenarios/login.json |
| Direct mutation | Remove Keyboard | UI immediately shows two items; initial code mutates the same array | scenarios/list.json |

For example:

```powershell
npm run surgeon -- --project examples/buggy-react-app fix "Each Add to Cart click should add exactly one item" --scenario scenarios/cart.json
```

Use `undo` immediately after a fix to restore that session's original code. To reset all three to the documented starting defects, run `node scripts/reset-demo.mjs`. This explicitly overwrites only the three demo component files using stored fixture copies; do not run it if you want to keep manual edits to those components. Refresh the browser after reset to reset local state.

The integration test restores the counter automatically after collecting a successful proof. A persisted historical proof describes the verified patched state, not the deliberately reset demo.
