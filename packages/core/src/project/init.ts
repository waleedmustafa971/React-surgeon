import fs from "node:fs/promises";
import path from "node:path";
import { detectProject } from "./detect.js";
import { config, configSchema } from "./config.js";

/**
 * One-command setup. Everything here is idempotent and reports what it did,
 * because the common case is running it again after fixing one complaint.
 */
export interface InitStep {
  name: string;
  status: "done" | "skipped" | "manual";
  detail: string;
}

const VITE_CONFIGS = [
  "vite.config.ts",
  "vite.config.js",
  "vite.config.mts",
  "vite.config.mjs",
];

export async function findViteConfig(root: string) {
  for (const name of VITE_CONFIGS) {
    const file = path.join(root, name);
    try {
      await fs.access(file);
      return file;
    } catch {
      /* Try the next conventional name. */
    }
  }
  return undefined;
}

/**
 * Adds `surgeon()` ahead of the React plugin. Returns the edited source, or
 * undefined when the shape is unfamiliar enough that a wrong edit would be
 * worse than asking the user to add one line themselves.
 */
export function injectPlugin(source: string): string | undefined {
  if (/@react-surgeon\/vite-plugin/.test(source)) return undefined;
  const plugins = /(\bplugins\s*:\s*\[)/.exec(source);
  if (!plugins) return undefined;
  const importLine = 'import surgeon from "@react-surgeon/vite-plugin";\n';
  // Place the import after the last existing one so hoisting stays obvious.
  const imports = [...source.matchAll(/^import .*?;?\s*$/gm)];
  const last = imports.at(-1);
  const withImport = last
    ? source.slice(0, last.index + last[0].length) +
      "\n" +
      importLine.trimEnd() +
      source.slice(last.index + last[0].length)
    : importLine + source;
  const at = /(\bplugins\s*:\s*\[)/.exec(withImport)!;
  const insert = at.index + at[0].length;
  return withImport.slice(0, insert) + "surgeon(), " + withImport.slice(insert);
}

export async function init(
  root: string,
  options: { write?: boolean } = {},
): Promise<InitStep[]> {
  const write = options.write ?? true;
  const steps: InitStep[] = [];
  const project = await detectProject(root);
  steps.push({
    name: "React project",
    status: "done",
    detail: `react ${project.react}, ${project.language}, ${project.packageManager}`,
  });

  const settings = await config(root);
  steps.push({
    name: "Configuration",
    status: "done",
    detail: `.react-surgeon/config.json — provider ${settings.model.provider}, app ${settings.appURL}`,
  });

  const viteConfig = await findViteConfig(root);
  if (!viteConfig)
    steps.push({
      name: "Vite plugin",
      status: "manual",
      detail:
        "No vite.config found. Element selection needs @react-surgeon/vite-plugin registered before the React plugin.",
    });
  else {
    const source = await fs.readFile(viteConfig, "utf8");
    const name = path.basename(viteConfig);
    if (/@react-surgeon\/vite-plugin/.test(source))
      steps.push({
        name: "Vite plugin",
        status: "skipped",
        detail: `${name} already registers the plugin`,
      });
    else {
      const updated = injectPlugin(source);
      if (!updated)
        steps.push({
          name: "Vite plugin",
          status: "manual",
          detail: `Could not find a plugins array in ${name}. Add surgeon() before the React plugin yourself.`,
        });
      else {
        if (write) await fs.writeFile(viteConfig, updated);
        steps.push({
          name: "Vite plugin",
          status: "done",
          detail: `Added surgeon() to ${name}`,
        });
      }
    }
  }

  const deps = { ...project.scripts };
  steps.push({
    name: "Scripts",
    status: "done",
    detail:
      ["dev", "build", "test", "lint", "typecheck"]
        .filter((s) => deps[s])
        .join(", ") || "none detected; verification will skip missing ones",
  });

  return steps;
}

/** Defaults written on a fresh init, for documentation and tests. */
export const defaultConfig = () => configSchema.parse({});
