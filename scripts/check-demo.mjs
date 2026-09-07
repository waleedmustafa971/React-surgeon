import { readFile } from "node:fs/promises";

/**
 * The demo app must be committed with its three documented defects intact.
 * A `fix` run leaves patched sources on disk, and committing that state makes
 * `npm run lint` fail on a fresh clone and turns the lab into a no-op.
 */
const components = ["ProductCard", "Login", "MutableList"];
const patched = [];
for (const name of components) {
  const [fixture, current] = await Promise.all([
    readFile(
      new URL(
        `../examples/buggy-react-app/fixtures/${name}.tsx.txt`,
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        `../examples/buggy-react-app/src/components/${name}.tsx`,
        import.meta.url,
      ),
      "utf8",
    ),
  ]);
  if (fixture !== current) patched.push(name);
}
if (patched.length) {
  console.error(
    `Demo app is not in its documented buggy state: ${patched.join(", ")}.\n` +
      `Agent edits must not be committed. Restore the defects with:\n` +
      `  node scripts/reset-demo.mjs`,
  );
  process.exit(1);
}
console.log("Demo app matches the documented defect fixtures.");
