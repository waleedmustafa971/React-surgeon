/**
 * Recovers the JSON object from a model response.
 *
 * The bundled and llama.cpp providers constrain generation with a grammar, so
 * their output is already bare JSON. An arbitrary OpenAI-compatible server —
 * Ollama, LM Studio, vLLM — may ignore `response_format` entirely and wrap the
 * object in a markdown fence or surround it with prose. Normalising here keeps
 * that server variance out of the agent.
 */
export function extractJsonText(raw: string): string {
  const text = raw.trim();
  const fenced = /^```[a-zA-Z]*[ \t]*\r?\n([\s\S]*?)\r?\n?```$/.exec(text);
  if (fenced) return fenced[1].trim();
  const start = text.indexOf("{"),
    end = text.lastIndexOf("}");
  if (start !== -1 && end > start) {
    const candidate = text.slice(start, end + 1);
    if (candidate !== text) return candidate;
  }
  return text;
}
