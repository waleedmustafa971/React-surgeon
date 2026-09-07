import * as vscode from "vscode";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { randomBytes } from "node:crypto";
import {
  Agent,
  config,
  detectProject,
  analyze,
  xray,
  Workspace,
  Bridge,
  LlamaCppProvider,
  ResourceManager,
  verify,
  saveProof,
  scenarioSchema,
  cleanup,
} from "@react-surgeon/core";
import type { SelectedElement } from "@react-surgeon/shared";
let stop: () => Promise<void> = async () => {};
export function activate(context: vscode.ExtensionContext) {
  const logs = vscode.window.createOutputChannel("React Surgeon");
  context.subscriptions.push(logs);
  let bridge: Bridge | undefined,
    model: LlamaCppProvider | undefined,
    selected: SelectedElement | undefined,
    view: vscode.WebviewView | undefined,
    busy = false;
  let activeAgent: Agent | undefined;
  const root = () => {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) throw new Error("Open a React project folder first");
    return folder.uri.fsPath;
  };
  const status = (message: string) => {
    logs.appendLine(message);
    void view?.webview.postMessage({ type: "status", message });
  };
  const provider = async () => {
    const c = await config(root());
    return (model ??= new LlamaCppProvider(root(), c.model, status));
  };
  stop = async () => {
    await activeAgent?.cancel();
    await bridge?.stop();
    bridge = undefined;
    await model?.stop();
    await cleanup();
    status("Stopped");
  };
  const start = async () => {
    if (bridge) return;
    const p = await detectProject(root()),
      c = await config(root());
    await provider();
    bridge = new Bridge(new Workspace(root()), c.bridgePort, c.appURL);
    await bridge.start();
    bridge.on("selection", (s: SelectedElement) => {
      selected = s;
      status(`Selected ${s.file}:${s.line}`);
      void view?.webview.postMessage({
        type: "selected",
        message: `${s.file}:${s.line}`,
      });
    });
    bridge.on("recording", (steps) => {
      void fs.writeFile(
        path.join(root(), ".react-surgeon/recording.json"),
        JSON.stringify(
          {
            name: "Recorded scenario: add assertions",
            baseURL: c.appURL,
            steps,
          },
          null,
          2,
        ),
      );
    });
    bridge.on("bridgeError", (e) => status(String(e)));
    status(`React ${p.react} · Local model · LOW memory`);
    await vscode.env.openExternal(
      vscode.Uri.parse(`${c.appURL}/?reactSurgeonToken=${bridge.token}`),
    );
  };
  const scenario = async () => {
    const picked = await vscode.window.showOpenDialog({
      defaultUri: vscode.Uri.file(root()),
      filters: { "Acceptance scenario": ["json"] },
      canSelectMany: false,
    });
    if (!picked?.[0]) return;
    return scenarioSchema.parse(
      JSON.parse(await fs.readFile(picked[0].fsPath, "utf8")),
    );
  };
  const fix = async (task: string) => {
    if (!task.trim()) throw new Error("Describe the selected bug first");
    if (!selected) throw new Error("Select an instrumented UI element first");
    const s = await scenario();
    if (!s) return;
    activeAgent = new Agent(root(), await provider(), status);
    try {
      const proof = await activeAgent.fix(task, s, selected);
      status(proof.status);
    } finally {
      activeAgent = undefined;
    }
  };
  const commands: Record<string, () => unknown> = {
    doctor: () =>
      status(
        JSON.stringify({
          os: os.type(),
          RAM_GB: os.totalmem() / 2 ** 30,
          freeGB: os.freemem() / 2 ** 30,
          node: process.version,
          mode: "LOW",
        }),
      ),
    start,
    stop,
    model: async () => {
      await (await provider()).start();
      status("Model ready");
    },
    select: async () => {
      await start();
      bridge?.send("select");
      status("Select an element in your browser");
    },
    diagnose: async () => {
      const task = await vscode.window.showInputBox({
        prompt: "What is wrong with the selected element?",
      });
      if (task)
        status(
          (
            await new Agent(root(), await provider(), status).diagnose(
              task,
              selected,
            )
          ).text,
        );
    },
    verify: async () => {
      const s = await scenario();
      if (!s) return;
      const result = await verify(
        await detectProject(root()),
        await config(root()),
        new ResourceManager(await provider()),
        s,
        status,
      );
      const proof = await saveProof(
        root(),
        "Verify current fix",
        [],
        result,
        s,
      );
      status(proof.status);
    },
    xray: async () => {
      const doc = await vscode.workspace.openTextDocument({
        language: "plaintext",
        content: xray(await analyze(root())),
      });
      await vscode.window.showTextDocument(doc);
    },
    proof: async () => {
      await vscode.window.showTextDocument(
        vscode.Uri.file(path.join(root(), ".react-surgeon/proofs/latest.json")),
      );
    },
    logs: () => logs.show(),
  };
  const guard = async (fn: () => unknown) => {
    if (busy) {
      status("An operation is already running");
      return;
    }
    busy = true;
    try {
      if (!vscode.workspace.isTrusted)
        throw new Error("Trust this workspace before running project commands");
      await fn();
    } catch (e) {
      status(`Blocked: ${(e as Error).message}`);
    } finally {
      busy = false;
    }
  };
  for (const [name, fn] of Object.entries(commands))
    context.subscriptions.push(
      vscode.commands.registerCommand("reactSurgeon." + name, () =>
        name === "stop" ? stop() : guard(fn),
      ),
    );
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("reactSurgeon.panel", {
      resolveWebviewView(v) {
        view = v;
        v.webview.options = { enableScripts: true };
        const nonce = randomBytes(16).toString("hex");
        v.webview.html = `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'"><style nonce="${nonce}">body{font-family:var(--vscode-font-family);padding:18px;color:var(--vscode-foreground)}h2{font-size:16px;letter-spacing:2px}p{line-height:1.5;opacity:.8}button,textarea{box-sizing:border-box;width:100%;margin:6px 0;padding:10px;background:var(--vscode-input-background);color:var(--vscode-input-foreground);border:1px solid var(--vscode-input-border);border-radius:4px}button{cursor:pointer}button.primary{background:#167356;color:white}#selected{color:#48d5ac}#status{white-space:pre-wrap;font-size:12px;border-top:1px solid #7775;padding-top:14px}</style></head><body><h2>REACT SURGEON</h2><p>Click a bug. Watch it get diagnosed, fixed, and verified.</p><button data-command="start">Connect project</button><button data-command="select">Select UI element</button><p id="selected">No element selected</p><label for="task">What's wrong?</label><textarea id="task" rows="4" placeholder="Describe the expected behavior"></textarea><button class="primary" id="fix">Diagnose &amp; Fix</button><button data-command="verify">Verify current fix</button><button data-command="proof">Show proof</button><button data-command="xray">Open X-Ray</button><p id="status">Local inference · CPU only · One agent</p><script nonce="${nonce}">const api=acquireVsCodeApi();document.querySelectorAll('[data-command]').forEach(b=>b.onclick=()=>api.postMessage({command:b.dataset.command}));document.getElementById('fix').onclick=()=>api.postMessage({command:'fix',task:document.getElementById('task').value});window.addEventListener('message',e=>{if(e.data.type==='selected'||e.data.type==='status')document.getElementById(e.data.type).textContent=e.data.message;});</script></body></html>`;
        v.webview.onDidReceiveMessage(
          (m) => {
            if (m.command === "fix" && typeof m.task === "string")
              void guard(() => fix(m.task));
            else if (typeof m.command === "string" && commands[m.command])
              void guard(commands[m.command]);
          },
          undefined,
          context.subscriptions,
        );
      },
    }),
  );
}
export async function deactivate() {
  await stop();
}
