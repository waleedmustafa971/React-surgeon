import path from "node:path";
import type {
  ModelProvider,
  ModelRequest,
  ModelResponse,
} from "@react-surgeon/shared";
import type { Config } from "../project/config.js";

/**
 * In-process llama.cpp through node-llama-cpp, which npm installs as a
 * prebuilt binary for the platform. Nothing has to be on PATH.
 *
 * The agent stops the model before static checks and the browser replay, so
 * `stop()` disposes the context and model rather than merely idling them —
 * that is what keeps the whole pipeline inside a 6 GB machine.
 */

/** Minimal structural types; the real ones come from the optional dependency. */
interface Disposable {
  dispose(): Promise<void> | void;
}
interface Session {
  prompt(
    text: string,
    options: { temperature: number; maxTokens: number; grammar?: unknown },
  ): Promise<string>;
}
interface Llama extends Disposable {
  loadModel(options: { modelPath: string }): Promise<LoadedModel>;
  getGrammarFor(type: string): Promise<unknown>;
}
interface LoadedModel extends Disposable {
  createContext(options: {
    contextSize?: number;
    threads?: number;
    sequences?: number;
  }): Promise<LoadedContext>;
}
interface LoadedContext extends Disposable {
  getSequence(): unknown;
}
interface NodeLlamaModule {
  getLlama(options: { gpu: false; maxThreads?: number }): Promise<Llama>;
  resolveModelFile(
    uri: string,
    options: {
      directory: string;
      onProgress?: (s: { totalSize: number; downloadedSize: number }) => void;
    },
  ): Promise<string>;
  LlamaChatSession: new (options: {
    contextSequence: unknown;
    systemPrompt?: string;
  }) => Session;
}

async function load(): Promise<NodeLlamaModule> {
  try {
    return (await import("node-llama-cpp")) as unknown as NodeLlamaModule;
  } catch {
    throw new Error(
      "node-llama-cpp is not installed. Reinstall without --omit=optional, " +
        "or set model.provider to 'openai-compatible' or 'llama.cpp' in .react-surgeon/config.json.",
    );
  }
}

export class NodeLlamaProvider implements ModelProvider {
  private llama?: Llama;
  private model?: LoadedModel;
  private context?: LoadedContext;
  private grammar?: unknown;
  private busy = false;
  constructor(
    private root: string,
    public settings: Config["model"],
    private log: (s: string) => void = () => {},
  ) {}

  async isRunning() {
    return this.context !== undefined;
  }

  /** Resolves a local GGUF, downloading it into the workspace cache once. */
  private async modelFile(mod: NodeLlamaModule) {
    if (this.settings.modelPath) return this.settings.modelPath;
    const directory = path.join(this.root, ".react-surgeon/models");
    let announced = -1;
    return mod.resolveModelFile(
      `hf:${this.settings.repository}:${this.settings.quantization}`,
      {
        directory,
        onProgress: ({ totalSize, downloadedSize }) => {
          if (!totalSize) return;
          const pct = Math.floor((downloadedSize / totalSize) * 100);
          // Ten updates is enough to show life without flooding the log.
          if (pct >= announced + 10) {
            announced = pct - (pct % 10);
            this.log(`Downloading model: ${announced}%`);
          }
        },
      },
    );
  }

  async start() {
    if (this.context) return;
    const mod = await load();
    this.log("Starting bundled CPU model; first launch downloads the GGUF.");
    const modelPath = await this.modelFile(mod);
    this.llama = await mod.getLlama({
      gpu: false,
      maxThreads: this.settings.threads,
    });
    try {
      this.model = await this.llama.loadModel({ modelPath });
      this.context = await this.model.createContext({
        contextSize: this.settings.contextSize,
        threads: this.settings.threads,
        sequences: 1,
      });
      this.grammar = await this.llama.getGrammarFor("json");
      this.log("Local model ready");
    } catch (e) {
      await this.stop();
      throw e;
    }
  }

  /** Frees the weights; the browser phase needs the memory back. */
  async stop() {
    const started = this.context !== undefined;
    for (const resource of [this.context, this.model, this.llama])
      try {
        await resource?.dispose();
      } catch {
        /* Disposal is best effort; a failure here must not mask the real one. */
      }
    this.context = this.model = this.llama = undefined;
    this.grammar = undefined;
    if (started) this.log("Local model stopped");
  }

  async generate(request: ModelRequest): Promise<ModelResponse> {
    if (this.busy) throw new Error("Only one model generation is allowed");
    this.busy = true;
    try {
      await this.start();
      const mod = await load();
      // A fresh session per action: the agent sends whole prompts and must not
      // accumulate conversation history across iterations.
      const session = new mod.LlamaChatSession({
        contextSequence: this.context!.getSequence(),
        systemPrompt: request.system,
      });
      const text = await session.prompt(request.prompt, {
        temperature: 0.1,
        maxTokens: request.maxTokens ?? 700,
        grammar: this.grammar,
      });
      if (!text) throw new Error("Empty model response");
      return { text };
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
