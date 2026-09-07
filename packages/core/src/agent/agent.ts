import fs from "node:fs/promises";
import path from "node:path";
import type {
  ModelProvider,
  Scenario,
  SelectedElement,
  Proof,
} from "@react-surgeon/shared";
import { Workspace, redact } from "../security/workspace.js";
import { detectProject } from "../project/detect.js";
import { analyze, relatedFiles } from "../analysis/graph.js";
import { config } from "../project/config.js";
import { parseAction, SYSTEM_PROMPT } from "./protocol.js";
import { budget, buildContext } from "./context.js";
import { PatchEngine } from "../tools/patch.js";
import { ResourceManager } from "../resources/manager.js";
import {
  saveProof,
  verify,
  withApp,
  parseBuildOutput,
} from "../verification/verify.js";
import { replay } from "../browser/scenario.js";
import { runScript } from "../resources/process.js";
/** Model turns per task, including read-only tool calls that do not patch. */
const MAX_STEPS = 12;
/** Patch-then-verify rounds; each one runs static checks and a browser replay. */
const MAX_PATCH_CYCLES = 4;
export class Agent {
  private cancelled = false;
  async cancel() {
    this.cancelled = true;
    await this.model.stop();
  }
  readonly resources: ResourceManager;
  readonly patches: PatchEngine;
  private running = false;
  constructor(
    private root: string,
    private model: ModelProvider,
    private onProgress: (s: string) => void = () => {},
  ) {
    this.resources = new ResourceManager(model);
    this.patches = new PatchEngine(new Workspace(root));
  }
  private async log(message: string) {
    this.onProgress(message);
    const dir = path.join(this.root, ".react-surgeon/logs");
    await fs.mkdir(dir, { recursive: true });
    await fs.appendFile(
      path.join(dir, "agent.jsonl"),
      JSON.stringify({
        time: new Date().toISOString(),
        message: redact(message),
      }) + "\n",
    );
  }
  async fix(
    task: string,
    scenario: Scenario,
    selected?: SelectedElement,
  ): Promise<Proof> {
    if (this.running) throw new Error("An agent task is already running");
    this.running = true;
    this.cancelled = false;
    try {
      const ws = new Workspace(this.root),
        project = await detectProject(this.root),
        settings = await config(this.root);
      let graph = await analyze(this.root),
        failure = "",
        extra = "",
        cycles = 0;
      const seen = new Set<string>();
      await this.log("Reproducing the original behavior…");
      const baseline = await this.resources.runtime(() =>
        withApp(project, scenario.baseURL, this.resources, () =>
          replay(scenario),
        ),
      );
      if (baseline.status === "passed")
        throw new Error(
          "Acceptance scenario already passes. Provide a scenario that reproduces the reported bug.",
        );
      failure = baseline.error ?? "";
      if (baseline.source) {
        if (selected && selected.file !== baseline.source.file)
          await this.log(
            `Stored selection ${selected.file} differs from the scenario; using the reproduced interaction.`,
          );
        selected = baseline.source;
        await this.log(
          `Tracing ${selected.file}:${selected.line} from browser reproduction`,
        );
      }
      const repairTask = `${task}\nAcceptance scenario: ${scenario.name}\n${JSON.stringify(scenario.steps)}`;
      let lastProof: Proof | undefined;
      for (let iteration = 0; iteration < MAX_STEPS; iteration++) {
        if (this.cancelled) throw new Error("Task cancelled");
        await this.log(
          `Diagnosing (step ${iteration + 1}/${MAX_STEPS}, patch cycle ${cycles + 1}/${MAX_PATCH_CYCLES})…`,
        );
        const prompt =
          (await buildContext(
            ws,
            project,
            graph,
            repairTask,
            selected,
            failure,
          )) +
          "\n" +
          budget(extra, 250);
        let action;
        try {
          action = parseAction(
            (await this.model.generate({ system: SYSTEM_PROMPT, prompt })).text,
          );
        } catch (e) {
          if (this.cancelled) throw new Error("Task cancelled");
          action = parseAction(
            (
              await this.model.generate({
                system: SYSTEM_PROMPT,
                prompt: `Your output was invalid: ${budget((e as Error).message, 180)}. Return one valid action object using the documented schema.\n${prompt}`,
              })
            ).text,
          );
        }
        const key = JSON.stringify(action);
        if (this.cancelled) throw new Error("Task cancelled");
        if (seen.has(key))
          throw new Error(
            "Repeated unsuccessful model action; stopped to avoid a loop",
          );
        seen.add(key);
        if (action.type === "complete")
          throw new Error(
            `Model stopped without a verified patch: ${action.summary}`,
          );
        if (action.type === "tool") {
          await this.log(`Inspecting: ${action.tool}`);
          const a = action.arguments;
          let data: unknown;
          switch (action.tool) {
            case "read_file":
              data = await ws.read(String(a.path));
              break;
            case "list_directory":
              data = await ws.files(String(a.path ?? "."));
              break;
            case "search_code": {
              const hits = [];
              for (const f of await ws.files()) {
                if (f.endsWith("lock.json")) continue;
                const lines = (await ws.read(f)).split("\n");
                for (let i = 0; i < lines.length; i++)
                  if (lines[i].includes(String(a.query)))
                    hits.push(`${f}:${i + 1}:${lines[i]}`);
                if (hits.length > 30) break;
              }
              data = hits;
              break;
            }
            case "find_component":
            case "get_component":
              data = graph.components.filter((c) => c.name === a.name);
              break;
            case "get_related_files":
              data = relatedFiles(graph, String(a.path));
              break;
            case "read_package_json":
              data = project;
              break;
            case "get_routes":
              data = graph.routes;
              break;
            case "get_project_graph":
              data = graph;
              break;
            case "get_git_diff":
              data = await this.patches.changes();
              break;
            case "get_build_errors":
            case "get_runtime_errors":
              data = failure;
              break;
            case "run_build":
            case "run_lint":
            case "run_tests": {
              await this.model.stop();
              const name =
                action.tool === "run_build"
                  ? "build"
                  : action.tool === "run_lint"
                    ? "lint"
                    : "test";
              data = project.scripts[name]
                ? parseBuildOutput((await runScript(this.root, name)).output)
                : "Script unavailable";
              break;
            }
          }
          extra = redact(JSON.stringify(data));
          continue;
        }
        await this.log(`Patching ${action.path}…`);
        try {
          await this.patches.apply(action.path, action.oldText, action.newText);
        } catch (e) {
          failure = (e as Error).message;
          extra = `Rejected patch for ${action.path}. oldText was ${JSON.stringify(action.oldText)}. Copy the exact existing substring from FILE context; do not change whitespace or invent source.`;
          await this.log(
            `Patch rejected: ${failure}; requested oldText: ${redact(action.oldText).slice(0, 600)}`,
          );
          continue;
        }
        await fs.writeFile(
          path.join(this.root, ".react-surgeon/state.json"),
          JSON.stringify({ task, iteration, cycles, selected }),
        );
        const verification = await verify(
          project,
          settings,
          this.resources,
          scenario,
          (m) => this.onProgress(m),
        );
        lastProof = await saveProof(
          this.root,
          task,
          await this.patches.changes(),
          verification,
          scenario,
          baseline,
        );
        if (verification.verified) {
          await this.log(
            "VERIFIED — static checks and browser assertions passed",
          );
          return lastProof;
        }
        if (++cycles >= MAX_PATCH_CYCLES) break;
        failure = JSON.stringify({
          static: verification.static.filter((c) => c.status === "failed"),
          runtime: verification.runtime,
        });
        graph = await analyze(this.root);
      }
      if (lastProof) return lastProof;
      throw new Error("Agent iteration limit reached without a verified fix");
    } finally {
      await this.model.stop();
      this.running = false;
    }
  }
  async diagnose(task: string, selected?: SelectedElement) {
    const ws = new Workspace(this.root),
      project = await detectProject(this.root),
      graph = await analyze(this.root);
    try {
      return await this.model.generate({
        system:
          SYSTEM_PROMPT +
          " For diagnosis only, use complete with a concise diagnosis; do not patch.",
        prompt: await buildContext(ws, project, graph, task, selected),
      });
    } finally {
      await this.model.stop();
    }
  }
}
