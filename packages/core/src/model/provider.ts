import type { ModelProvider } from "@react-surgeon/shared";
import type { Config } from "../project/config.js";
import { LlamaCppProvider } from "./llama.js";
import { NodeLlamaProvider } from "./node-llama.js";
import { OpenAICompatibleProvider } from "./openai.js";

/** A provider that can also validate itself end to end. */
export interface SetupCapableProvider extends ModelProvider {
  setup(): Promise<{ text: string; tokens?: number }>;
  settings: Config["model"];
}

export function createProvider(
  root: string,
  settings: Config["model"],
  log: (s: string) => void = () => {},
): SetupCapableProvider {
  switch (settings.provider) {
    case "openai-compatible":
      return new OpenAICompatibleProvider(settings, log);
    case "llama.cpp":
      return new LlamaCppProvider(root, settings, log);
    case "node-llama-cpp":
      return new NodeLlamaProvider(root, settings, log);
  }
}

/** One line describing where inference will happen, for doctor and logs. */
export function describeProvider(settings: Config["model"]) {
  switch (settings.provider) {
    case "openai-compatible":
      return `${settings.model} via ${settings.baseURL}`;
    case "llama.cpp":
      return `${settings.repository}:${settings.quantization} via llama-server on PATH`;
    case "node-llama-cpp":
      return `${settings.repository}:${settings.quantization} via bundled node-llama-cpp`;
  }
}
