import fs from "node:fs/promises";
import path from "node:path";
import type {
  ProjectInfo,
  Scenario,
  VerificationResult,
  Proof,
  FileChange,
  RuntimeResult,
} from "@react-surgeon/shared";
import type { Config } from "../project/config.js";
import {
  runScript,
  launch,
  npmCommand,
  nodeCommand,
  terminate,
} from "../resources/process.js";
import { ResourceManager } from "../resources/manager.js";
import { replay, localURL } from "../browser/scenario.js";
import { redact } from "../security/workspace.js";
export function parseBuildOutput(output: string) {
  return redact(
    output
      .split(/\r?\n/)
      .filter((l) => /error|failed|\.[jt]sx?[:(]\d|×|✖/i.test(l))
      .slice(0, 24)
      .join("\n") || output.slice(-2000),
  );
}
export async function withApp<T>(
  project: ProjectInfo,
  url: string,
  resources: ResourceManager,
  fn: () => Promise<T>,
): Promise<T> {
  const address = new URL(localURL(url));
  let child;
  let tail = "";
  try {
    let reachable = false;
    try {
      reachable = (await fetch(url, { signal: AbortSignal.timeout(1000) })).ok;
    } catch {
      /* Start development server if absent. */
    }
    if (!reachable) {
      if (!project.dependencies.vite || !project.scripts.dev)
        throw new Error(
          "Start the React app manually; automatic launch supports Vite with a dev script",
        );
      child = launch(
        nodeCommand(),
        [
          npmCommand(),
          "run",
          "dev",
          "--",
          "--host",
          "127.0.0.1",
          "--port",
          address.port || "5173",
          "--strictPort",
        ],
        project.root,
      );
      let failure: Error | undefined;
      child.on("error", (e) => {
        failure = e;
      });
      child.stderr?.on("data", (b: Buffer) => {
        tail = (tail + b.toString()).slice(-2000);
      });
      child.stdout?.on("data", (b: Buffer) => {
        tail = (tail + b.toString()).slice(-2000);
      });
      const until = Date.now() + 30000;
      while (Date.now() < until) {
        if (failure) throw failure;
        if (child.exitCode !== null) throw new Error("Vite failed: " + tail);
        try {
          if ((await fetch(url, { signal: AbortSignal.timeout(1000) })).ok) {
            reachable = true;
            break;
          }
        } catch {
          /* Waiting for Vite. */
        }
        await new Promise((r) => setTimeout(r, 300));
      }
      if (!reachable) throw new Error("Vite startup timed out: " + tail);
    }
    resources.vite = true;
    return await fn();
  } finally {
    resources.vite = false;
    if (child) await terminate(child);
  }
}
export async function verify(
  project: ProjectInfo,
  settings: Config,
  resources: ResourceManager,
  scenario: Scenario,
  log: (s: string) => void = () => {},
): Promise<VerificationResult> {
  await resources.model.stop();
  const checks: VerificationResult["static"] = [];
  for (const name of ["typecheck", "lint", "test", "build"] as const) {
    if (
      !project.scripts[name] ||
      (name !== "typecheck" && !settings.verification[name])
    ) {
      checks.push({
        name,
        status: "skipped",
        durationMs: 0,
        output: "Not configured",
      });
      continue;
    }
    log(`Checking ${name}…`);
    const r = await runScript(project.root, name);
    checks.push({
      name,
      status: r.code === 0 ? "passed" : "failed",
      durationMs: r.durationMs,
      output: parseBuildOutput(r.output),
    });
  }
  let runtime: RuntimeResult = {
    status: "skipped",
    url: scenario.baseURL,
    consoleErrors: [],
    pageErrors: [],
    failedRequests: [],
    assertions: 0,
    state: "",
  };
  if (settings.verification.browser) {
    log("Replaying browser scenario…");
    runtime = await resources.runtime(() =>
      withApp(project, scenario.baseURL, resources, () => replay(scenario)),
    );
  }
  return {
    static: checks,
    runtime,
    verified:
      checks.some((c) => c.name === "build" && c.status === "passed") &&
      !checks.some((c) => c.status === "failed") &&
      runtime.status === "passed" &&
      runtime.assertions > 0,
  };
}
export async function saveProof(
  root: string,
  task: string,
  changes: FileChange[],
  verification: VerificationResult,
  scenario: Scenario,
  baseline?: RuntimeResult,
): Promise<Proof> {
  const id = new Date().toISOString().replace(/[:.]/g, "-");
  const proof: Proof = {
    id,
    createdAt: new Date().toISOString(),
    task,
    acceptanceCriteria: scenario.steps
      .filter((s) => s.action.startsWith("assert"))
      .map((s) => JSON.stringify(s)),
    changes,
    verification,
    scenario,
    status: verification.verified ? "VERIFIED" : "BLOCKED",
    baseline,
  };
  const dir = path.join(root, ".react-surgeon/proofs");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, `${id}.json`),
    JSON.stringify(proof, null, 2),
  );
  await fs.writeFile(
    path.join(dir, "latest.json"),
    JSON.stringify(proof, null, 2),
  );
  return proof;
}
