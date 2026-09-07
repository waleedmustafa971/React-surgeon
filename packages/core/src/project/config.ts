import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
export const configSchema = z.object({
  model: z
    .object({
      /**
       * `node-llama-cpp` needs no system install: npm ships a prebuilt binary
       * for the platform. `llama.cpp` drives a llama-server found on PATH.
       * `openai-compatible` talks to a server you already run, such as Ollama
       * or LM Studio.
       */
      provider: z
        .enum(["node-llama-cpp", "llama.cpp", "openai-compatible"])
        .default("node-llama-cpp"),
      repository: z
        .string()
        .regex(/^[\w.-]+\/[\w.-]+$/)
        .default("Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF"),
      quantization: z.enum(["Q4_K_M", "Q3_K_M"]).default("Q4_K_M"),
      contextSize: z.number().int().min(2048).max(16384).default(4096),
      threads: z.number().int().min(1).max(64).default(4),
      executable: z.string().optional(),
      modelPath: z.string().optional(),
      port: z.number().int().min(1024).max(65535).default(18081),
      /** openai-compatible: where the server listens. */
      baseURL: z.string().url().default("http://127.0.0.1:11434/v1"),
      /** openai-compatible: model name the server exposes. */
      model: z.string().default("qwen2.5-coder:1.5b"),
      /**
       * openai-compatible: the environment variable holding the API key, never
       * the key itself. Local servers usually need none.
       */
      apiKeyEnv: z.string().optional(),
      /**
       * openai-compatible: inference leaves this machine only when explicitly
       * allowed. Off by default, which keeps the local-only guarantee.
       */
      allowRemote: z.boolean().default(false),
    })
    .default({}),
  memoryMode: z.enum(["low", "auto"]).default("low"),
  verification: z
    .object({
      lint: z.boolean().default(true),
      test: z.boolean().default(true),
      build: z.boolean().default(true),
      browser: z.boolean().default(true),
    })
    .default({}),
  bridgePort: z.number().int().min(1024).max(65535).default(18080),
  appURL: z.string().default("http://127.0.0.1:5173"),
});
export type Config = z.infer<typeof configSchema>;
export async function config(root: string): Promise<Config> {
  const dir = path.join(root, ".react-surgeon");
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, "config.json");
  try {
    return configSchema.parse(JSON.parse(await fs.readFile(file, "utf8")));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    const value = configSchema.parse({});
    await fs.writeFile(file, JSON.stringify(value, null, 2));
    return value;
  }
}
