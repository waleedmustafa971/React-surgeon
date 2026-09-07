import type {
  ModelProvider,
  ModelRequest,
  ModelResponse,
} from "@react-surgeon/shared";
import type { Config } from "../project/config.js";
import { extractJsonText } from "./json.js";

const LOCAL_HOSTS = ["127.0.0.1", "localhost", "[::1]", "::1", "0.0.0.0"];

/**
 * Talks to an OpenAI-compatible server the user already runs — Ollama, LM
 * Studio, llama-server, vLLM. React Surgeon does not own the process, so
 * `start`/`stop` are deliberately inert: stopping someone else's server to
 * free memory before the browser phase would be rude and surprising.
 *
 * The endpoint must be loopback unless `model.allowRemote` is explicitly set,
 * which keeps "inference stays on this machine" true by default.
 */
export class OpenAICompatibleProvider implements ModelProvider {
  private busy = false;
  constructor(
    public settings: Config["model"],
    private log: (s: string) => void = () => {},
  ) {
    const url = new URL(settings.baseURL);
    if (!settings.allowRemote && !LOCAL_HOSTS.includes(url.hostname))
      throw new Error(
        `model.baseURL points at ${url.hostname}, which is not this machine. ` +
          "Set model.allowRemote to true in .react-surgeon/config.json to send your source code there.",
      );
  }

  private get key() {
    return this.settings.apiKeyEnv
      ? process.env[this.settings.apiKeyEnv]
      : undefined;
  }

  async isRunning() {
    try {
      const r = await fetch(new URL("models", this.base), {
        headers: this.headers(),
        signal: AbortSignal.timeout(2000),
      });
      return r.ok;
    } catch {
      return false;
    }
  }

  private get base() {
    return this.settings.baseURL.endsWith("/")
      ? this.settings.baseURL
      : this.settings.baseURL + "/";
  }

  private headers() {
    return {
      "Content-Type": "application/json",
      ...(this.key ? { Authorization: `Bearer ${this.key}` } : {}),
    };
  }

  /** The server's lifecycle belongs to whoever started it. */
  async start() {
    if (await this.isRunning()) return;
    throw new Error(
      `No OpenAI-compatible server responded at ${this.settings.baseURL}. ` +
        "Start it (for example `ollama serve`), or change model.provider in .react-surgeon/config.json.",
    );
  }
  async stop() {}

  async generate(request: ModelRequest): Promise<ModelResponse> {
    if (this.busy) throw new Error("Only one model generation is allowed");
    this.busy = true;
    try {
      await this.start();
      const r = await fetch(new URL("chat/completions", this.base), {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({
          model: this.settings.model,
          messages: [
            { role: "system", content: request.system },
            { role: "user", content: request.prompt },
          ],
          temperature: 0.1,
          max_tokens: request.maxTokens ?? 700,
          response_format: { type: "json_object" },
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
      // Not every server honours response_format; unwrap fences and prose.
      return {
        text: extractJsonText(text),
        tokens: data.usage?.completion_tokens,
      };
    } finally {
      this.busy = false;
    }
  }

  async setup() {
    if (!(await this.isRunning()))
      throw new Error(
        `No OpenAI-compatible server responded at ${this.settings.baseURL}.`,
      );
    this.log(`Using ${this.settings.model} at ${this.settings.baseURL}`);
    const result = await this.generate({
      system: "Return a JSON object only.",
      prompt: 'Return {"ready":true}',
      maxTokens: 32,
    });
    if (JSON.parse(result.text).ready !== true)
      throw new Error("Model smoke test did not return ready=true");
    return result;
  }
}
