import { readFile } from "node:fs/promises";
import { isBuiltin } from "node:module";

/**
 * Every published bundle must declare the packages it actually imports.
 *
 * esbuild resolves the workspace path aliases and inlines sibling packages, so
 * a dependency declared only on @react-surgeon/core is absent at runtime for
 * someone who installed @react-surgeon/cli. That has bitten twice — once for
 * the CLI's seven inherited externals, and once for node-llama-cpp, whose
 * dynamic import a static scan does not see.
 *
 * This reads esbuild's metafile rather than grepping the bundle, so it sees
 * dynamic imports and is not fooled by module specifiers that appear inside
 * ordinary string literals.
 */
const PACKAGES = ["shared", "core", "cli", "vite-plugin"];

/** `@scope/name/sub` -> `@scope/name`; `pkg/sub` -> `pkg`. */
function packageName(specifier) {
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

let failed = false;
for (const pkg of PACKAGES) {
  const manifest = JSON.parse(
    await readFile(`packages/${pkg}/package.json`, "utf8"),
  );
  let metafile;
  try {
    metafile = JSON.parse(await readFile(`.build-meta/${pkg}.json`, "utf8"));
  } catch {
    console.error(`${manifest.name}: no build metadata — run npm run build`);
    failed = true;
    continue;
  }

  const imported = new Set();
  for (const output of Object.values(metafile.outputs ?? {}))
    for (const entry of output.imports ?? []) {
      const specifier = entry.path;
      if (
        !entry.external ||
        specifier.startsWith(".") ||
        specifier.startsWith("/") ||
        specifier.startsWith("node:")
      )
        continue;
      const name = packageName(specifier);
      if (!isBuiltin(name)) imported.add(name);
    }

  const declared = new Set([
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.optionalDependencies ?? {}),
    ...Object.keys(manifest.peerDependencies ?? {}),
  ]);
  const missing = [...imported].filter((n) => !declared.has(n)).sort();
  if (missing.length) {
    console.error(
      `${manifest.name} imports but does not declare: ${missing.join(", ")}`,
    );
    failed = true;
  } else {
    console.log(`${manifest.name}: ${imported.size} imports, all declared`);
  }
}

if (failed) {
  console.error(
    "\nAdd the missing packages to that workspace's dependencies " +
      "(or optionalDependencies when the feature degrades gracefully).",
  );
  process.exit(1);
}
