import { type ChildProcess } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import type {
  ModelProvider,
  ModelRequest,
  ModelResponse,
} from "@react-surgeon/shared";
import type { Config } from "../project/config.js";
import { launch, terminate, run } from "../resources/process.js";
export async function findLlama(): Promise<{ exe: string; prefix: string[] }> {
  for (const [exe, prefix] of [
    ["llama-server", []],
    ["llama", ["serve"]],
  ] as [string, string[]][]) {
    try {
      const r = await run(exe, ["--version"], process.cwd(), 10000);
      if (r.code === 0) return { exe, prefix };
    } catch {
      /* Try next official executable. */
    }
  }
  throw new Error(
    "llama.cpp not found. Install with: winget install ggml.llamacpp",
  );
}
export class LlamaCppProvider implements ModelProvider {
  private child?: ChildProcess;
  private tail = "";
  private busy = false;
  constructor(
    private root: string,
    public settings: Config["model"],
    private log: (s: string) => void = () => {},
  ) {}
  get endpoint() {
    return `http://127.0.0.1:${this.settings.port}`;
  }
  async isRunning() {
    try {
      const r = await fetch(this.endpoint + "/health", {
        signal: AbortSignal.timeout(2000),
      });
      return r.ok;
    } catch {
      return false;
    }
  }
  async start() {
    if (this.child && (await this.isRunning())) return;
    if (await this.isRunning())
      throw new Error(
        "Model port already occupied; stop the existing server or change model.port",
      );
    const found = this.settings.executable
      ? { exe: this.settings.executable, prefix: [] }
      : await findLlama();
    const cache = path.join(this.root, ".react-surgeon/models");
    await fs.mkdir(cache, { recursive: true });
    const modelArgs = this.settings.modelPath
      ? ["-m", this.settings.modelPath]
      : ["-hf", `${this.settings.repository}:${this.settings.quantization}`];
    const args = [
      ...found.prefix,
      ...modelArgs,
      "--host",
      "127.0.0.1",
      "--port",
      String(this.settings.port),
      "-c",
      String(this.settings.contextSize),
      "-np",
      "1",
      "-ngl",
      "0",
      "-t",
      "4",
      "-b",
      "128",
      "-ub",
      "128",
      "--no-webui",
      "--json-schema",
      "{}",
    ];
    this.log("Starting CPU model; first launch may download GGUF.");
    // Set only this child's cache, leaving user-wide configuration unchanged.
    this.child = launch(found.exe, args, this.root, {
      ...process.env,
      LLAMA_CACHE: cache,
    });
    let failure: Error | undefined;
    this.child.once("error", (e) => {
      failure = e;
    });
    const collect = (b: Buffer) => {
      const s = b.toString();
      this.tail = (this.tail + s).slice(-6000);
      if (/download|error|loaded|listening/i.test(s))
        this.log(s.trim().slice(-400));
    };
    this.child.stderr?.on("data", collect);
    this.child.stdout?.on("data", collect);
    const until = Date.now() + 20 * 60_000;
    try {
      while (Date.now() < until) {
        if (failure) throw failure;
        if (this.child.exitCode !== null)
          throw new Error("llama.cpp exited: " + this.tail);
        if (await this.isRunning()) {
          this.log("Local model ready");
          return;
        }
        await new Promise((r) => setTimeout(r, 1000));
      }
      throw new Error("Model startup/download timed out: " + this.tail);
    } catch (e) {
      await this.stop();
      throw e;
    }
  }
  async stop() {
    if (this.child) {
      await terminate(this.child);
      this.child = undefined;
      this.log("Local model stopped");
    }
  }
  async generate(request: ModelRequest): Promise<ModelResponse> {
    if (this.busy) throw new Error("Only one model generation is allowed");
    this.busy = true;
    try {
      await this.start();
      const r = await fetch(this.endpoint + "/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            { role: "system", content: request.system },
            { role: "user", content: request.prompt },
          ],
          temperature: 0.1,
          max_tokens: request.maxTokens ?? 700,
          response_format: { type: "json_object", schema: { type: "object" } },
          stream: false,
        }),
        signal: AbortSignal.timeout(180000),
      });
      if (!r.ok)
        throw new Error(
          `Model API ${r.status}: ${(await r.text()).slice(0, 1200)}`,
        );
      const data = (await r.json()) as {
        choices?: { message: { content: string } }[];
        usage?: { completion_tokens: number };
      };
      const text = data.choices?.[0]?.message.content;
      if (!text) throw new Error("Empty model response");
      return { text, tokens: data.usage?.completion_tokens };
    } finally {
      this.busy = false;
    }
  }
  async setup() {
    try {
      await this.start();
      const result = await this.generate({
        system: "Return a JSON object only.",
        prompt: 'Return {"ready":true}',
        maxTokens: 32,
      });
      if (JSON.parse(result.text).ready !== true)
        throw new Error("Model smoke test did not return ready=true");
      return result;
    } finally {
      await this.stop();
    }
  }
}
