import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
export const configSchema = z.object({
  model: z
    .object({
      provider: z.literal("llama.cpp").default("llama.cpp"),
      repository: z
        .string()
        .regex(/^[\w.-]+\/[\w.-]+$/)
        .default("Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF"),
      quantization: z.enum(["Q4_K_M", "Q3_K_M"]).default("Q4_K_M"),
      contextSize: z.number().int().min(2048).max(16384).default(4096),
      executable: z.string().optional(),
      modelPath: z.string().optional(),
      port: z.number().int().min(1024).max(65535).default(18081),
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
