import { defineConfig } from "vitest/config";
import path from "node:path";
export default defineConfig({
  resolve: {
    alias: {
      "@react-surgeon/core": path.resolve("packages/core/src/index.ts"),
      "@react-surgeon/shared": path.resolve("packages/shared/src/index.ts"),
      "@react-surgeon/vite-plugin": path.resolve(
        "packages/vite-plugin/src/index.ts",
      ),
    },
  },
  test: {
    include: ["tests/**/*.test.ts", "examples/**/src/**/*.test.ts"],
    maxWorkers: 1,
    fileParallelism: false,
  },
});
