#!/usr/bin/env node
import { Command } from "commander";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  Agent,
  analyze,
  xray,
  detectProject,
  config,
  LlamaCppProvider,
  findLlama,
  Bridge,
  Workspace,
  cleanup,
  ResourceManager,
  verify,
  saveProof,
  scenarioSchema,
  PatchEngine,
  modelControl,
  stopModel,
} from "@react-surgeon/core";
import type { SelectedElement } from "@react-surgeon/shared";
const cli = new Command()
  .name("react-surgeon")
  .description("Click a bug. Diagnose, fix, and verify your React app.")
  .version("0.1.0")
  .option("-p, --project <path>", "React project root", process.cwd())
  .option("--verbose", "Detailed process logs");
let model: LlamaCppProvider | undefined, bridge: Bridge | undefined;
let closeControl: (() => Promise<void>) | undefined;
const root = () => path.resolve(cli.opts().project);
const output = (v: unknown) =>
  console.log(typeof v === "string" ? v : JSON.stringify(v, null, 2));
async function provider() {
  const c = await config(root());
  return (model ??= new LlamaCppProvider(
    root(),
    c.model,
    cli.opts().verbose ? console.log : () => {},
  ));
}
async function selected(): Promise<SelectedElement | undefined> {
  try {
    return JSON.parse(
      await fs.readFile(
        path.join(root(), ".react-surgeon/selection.json"),
        "utf8",
      ),
    );
  } catch {
    return undefined;
  }
}
function undoCommand() {
  const project = cli.opts().project as string;
  return path.resolve(project) === process.cwd()
    ? "react-surgeon undo"
    : `react-surgeon --project ${project} undo`;
}
function warnUnverified(files: string[]) {
  if (!files.length) return;
  console.error(
    `\nUnverified edits are still on disk: ${files.join(", ")}\n` +
      `They were NOT accepted by verification. Review the diff, or restore the originals with:\n` +
      `  ${undoCommand()}`,
  );
}
async function scenario(file: string) {
  return scenarioSchema.parse(
    JSON.parse(await fs.readFile(path.resolve(root(), file), "utf8")),
  );
}
async function close() {
  await closeControl?.();
  closeControl = undefined;
  await bridge?.stop();
  bridge = undefined;
  await model?.stop();
  await cleanup();
}
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => {
    void close().finally(() => process.exit(0));
  });
cli.command("doctor").action(async () => {
  let llama = "Missing";
  try {
    llama = (await findLlama()).exe;
  } catch {
    /* Report missing installation. */
  }
  output({
    product: "React Surgeon Bootstrap",
    os: os.type(),
    architecture: os.arch(),
    totalRAM_GB: +(os.totalmem() / 2 ** 30).toFixed(2),
    freeRAM_GB: +(os.freemem() / 2 ** 30).toFixed(2),
    cpuCores: os.cpus().length,
    node: process.version,
    llama,
    gpuRequirement: "None",
    memoryMode: "LOW",
    context: 4096,
  });
});
const m = cli.command("model");
m.command("setup").action(async () => output(await (await provider()).setup()));
m.command("start").action(async () => {
  await (await provider()).start();
  closeControl = await modelControl(root(), async () => {
    await close();
    process.exit(0);
  });
  output("Model running in foreground. Ctrl+C stops it.");
  await new Promise(() => {});
});
m.command("stop").action(async () => {
  await stopModel(root());
  output("Owned local model stop requested.");
});
cli.command("scan").action(async () => output(await detectProject(root())));
cli.command("xray").action(async () => output(xray(await analyze(root()))));
cli
  .command("health")
  .action(async () => output((await analyze(root())).diagnostics));
cli
  .command("diagnose")
  .argument("<task>")
  .action(async (task) =>
    output(
      (
        await new Agent(root(), await provider(), console.log).diagnose(
          task,
          await selected(),
        )
      ).text,
    ),
  );
cli
  .command("fix")
  .argument("<task>")
  .requiredOption("-s, --scenario <file>", "Acceptance scenario JSON")
  .action(async (task, opts) => {
    const agent = new Agent(root(), await provider(), console.log);
    try {
      const proof = await agent.fix(
        task,
        await scenario(opts.scenario),
        await selected(),
      );
      output({
        status: proof.status,
        proof: `.react-surgeon/proofs/${proof.id}.json`,
        files: proof.changes.map((c) => c.path),
      });
      if (proof.status !== "VERIFIED") {
        warnUnverified(proof.changes.map((c) => c.path));
        process.exitCode = 1;
      }
    } catch (e) {
      warnUnverified((await agent.patches.changes()).map((c) => c.path));
      throw e;
    }
  });
cli
  .command("verify")
  .requiredOption("-s, --scenario <file>")
  .action(async (opts) => {
    const p = await detectProject(root()),
      s = await scenario(opts.scenario),
      result = await verify(
        p,
        await config(root()),
        new ResourceManager(await provider()),
        s,
        console.log,
      );
    output(await saveProof(root(), "Verify current workspace", [], result, s));
    if (!result.verified) process.exitCode = 1;
  });
cli
  .command("proof")
  .action(async () =>
    output(
      JSON.parse(
        await fs.readFile(
          path.join(root(), ".react-surgeon/proofs/latest.json"),
          "utf8",
        ),
      ),
    ),
  );
cli.command("undo").action(async () => {
  await new PatchEngine(new Workspace(root())).undo();
  output("Restored files from the last patch session.");
});
cli.command("start").action(async () => {
  const p = await detectProject(root()),
    c = await config(root());
  await analyze(root());
  const model = await provider();
  await model.setup();
  bridge = new Bridge(new Workspace(root()), c.bridgePort, c.appURL);
  await bridge.start();
  bridge.on("selection", (s: SelectedElement) => {
    output(`Selected ${s.file}:${s.line}`);
    void fs.writeFile(
      path.join(root(), ".react-surgeon/selection.json"),
      JSON.stringify(s, null, 2),
    );
  });
  bridge.on("recording", (steps) => {
    void fs.writeFile(
      path.join(root(), ".react-surgeon/recording.json"),
      JSON.stringify(
        {
          name: "Recorded reproduction — add acceptance assertions",
          baseURL: c.appURL,
          steps,
        },
        null,
        2,
      ),
    );
  });
  bridge.on("bridgeError", (e) => console.error((e as Error).message));
  output(
    `React ${p.react} ready. Start your app, then open:\n${c.appURL}/?reactSurgeonToken=${bridge.token}\nSelection bridge on 127.0.0.1:${c.bridgePort}. Model sleeps until needed. Ctrl+C stops Surgeon.`,
  );
});
try {
  await cli.parseAsync();
} catch (e) {
  console.error("BLOCKED:", (e as Error).message);
  process.exitCode = 1;
  await close();
}
