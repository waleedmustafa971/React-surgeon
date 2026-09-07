import { spawn, type ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { existsSync } from "node:fs";
const require = createRequire(import.meta.url);
const active = new Set<ChildProcess>();
const cleanupHooks = new Set<() => Promise<void>>();
export function registerCleanup(fn: () => Promise<void>) {
  cleanupHooks.add(fn);
  return () => {
    cleanupHooks.delete(fn);
  };
}
export function launch(
  exe: string,
  args: string[],
  cwd: string,
  env?: NodeJS.ProcessEnv,
) {
  const child = spawn(exe, args, {
    cwd,
    env: env ?? process.env,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32",
  });
  active.add(child);
  child.once("exit", () => active.delete(child));
  child.once("error", () => active.delete(child));
  return child;
}
export async function terminate(child: ChildProcess) {
  if (!child.pid || child.exitCode !== null) return;
  if (process.platform === "win32") {
    await new Promise<void>((resolve) => {
      const p = spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
        windowsHide: true,
        stdio: "ignore",
      });
      p.once("close", () => resolve());
      p.once("error", () => {
        child.kill();
        resolve();
      });
    });
  } else {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      child.kill();
    }
  }
  await Promise.race([
    new Promise<void>((r) => {
      if (child.exitCode !== null) r();
      else child.once("exit", () => r());
    }),
    new Promise<void>((r) => setTimeout(r, 3000)),
  ]);
}
export async function cleanup() {
  await Promise.allSettled([...cleanupHooks].map((fn) => fn()));
  await Promise.all([...active].map(terminate));
}
export function nodeCommand() {
  return process.versions.electron ? "node" : process.execPath;
}
export function npmCommand() {
  const dirs = (process.env.PATH ?? "").split(path.delimiter);
  const candidates = [
    process.env.npm_execpath,
    path.join(
      path.dirname(process.execPath),
      "node_modules/npm/bin/npm-cli.js",
    ),
    ...dirs.flatMap((d) => [
      path.join(d, "node_modules/npm/bin/npm-cli.js"),
      path.join(d, "../lib/node_modules/npm/bin/npm-cli.js"),
    ]),
  ];
  const found = candidates.find((p): p is string => !!p && existsSync(p));
  if (!found)
    throw new Error(
      "npm CLI not found; install Node.js and restart VS Code to refresh PATH",
    );
  return found;
}
export async function runScript(root: string, name: string, timeout = 120_000) {
  if (!["build", "lint", "test", "typecheck", "dev"].includes(name))
    throw new Error("Command not allowlisted");
  let testArgs: string[] = [];
  if (name === "test") {
    const fs = await import("node:fs/promises");
    const pkg = JSON.parse(
      await fs.readFile(path.join(root, "package.json"), "utf8"),
    );
    const script = String(pkg.scripts?.test ?? "");
    if (/\bvitest\b/.test(script) && !/\brun\b/.test(script))
      testArgs = ["--", "--run"];
    else if (/\bjest\b/.test(script))
      testArgs = ["--", "--runInBand", "--watch=false"];
  }
  return run(
    nodeCommand(),
    [npmCommand(), "run", name, ...testArgs],
    root,
    timeout,
  );
}
export async function run(
  exe: string,
  args: string[],
  cwd: string,
  timeout: number,
) {
  const start = Date.now(),
    child = launch(exe, args, cwd);
  let output = "";
  const collect = (b: Buffer) => {
    output = (output + b.toString()).slice(-24000);
  };
  child.stdout?.on("data", collect);
  child.stderr?.on("data", collect);
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    void terminate(child);
  }, timeout);
  try {
    const code = await new Promise<number>((res, rej) => {
      child.once("error", rej);
      child.once("exit", (c) => res(c ?? 1));
    });
    return {
      code: timedOut ? 124 : code,
      output: timedOut ? "Command timed out\n" + output : output,
      durationMs: Date.now() - start,
    };
  } finally {
    clearTimeout(timer);
  }
}
export function modulePath(name: string) {
  return require.resolve(name);
}
