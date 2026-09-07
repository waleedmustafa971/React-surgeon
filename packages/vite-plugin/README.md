# @react-surgeon/vite-plugin

Development-only Vite plugin that maps clicked DOM elements back to their JSX source, for [React Surgeon](https://github.com/waleedmustafa971/React-surgeon).

Add it **before** the React plugin:

```ts
import surgeon from "@react-surgeon/vite-plugin";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [surgeon(), react()],
});
```

The plugin uses `apply: 'serve'`, instruments intrinsic JSX elements only, and leaves production output untouched. It inserts source attributes with MagicString while preserving source maps, and serves a shadow-root overlay that highlights hovered nodes and reports the file, line, role and accessible name of what you click. Element metadata uses project-relative paths.

Pair it with [`@react-surgeon/cli`](https://www.npmjs.com/package/@react-surgeon/cli) to diagnose, repair and verify what you selected.

Full documentation is in the [project README](https://github.com/waleedmustafa971/React-surgeon#readme).

MIT
