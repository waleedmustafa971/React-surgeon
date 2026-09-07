import type {
  ProjectGraph,
  ProjectInfo,
  SelectedElement,
} from "@react-surgeon/shared";
import { relatedFiles } from "../analysis/graph.js";
import { Workspace, redact } from "../security/workspace.js";
export function budget(text: string, maxTokens: number) {
  return text.slice(0, Math.max(0, Math.floor(maxTokens * 2.5)));
}
export async function buildContext(
  ws: Workspace,
  project: ProjectInfo,
  graph: ProjectGraph,
  task: string,
  selected?: SelectedElement,
  failure = "",
) {
  const words = task
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 3);
  const ranked = Object.keys(graph.imports)
    .map((file) => ({
      file,
      score: words.filter((w) => file.toLowerCase().includes(w)).length,
    }))
    .sort((a, b) => b.score - a.score);
  const files = [
    ...new Set([
      ...(selected ? relatedFiles(graph, selected.file) : []),
      ...(selected ? [] : ranked.map((r) => r.file)),
    ]),
  ].slice(0, 6);
  let context = `Task: ${budget(task, 200)}\nProject: ${JSON.stringify({ react: project.react, dependencies: project.dependencies, scripts: project.scripts })}\nSelected: ${JSON.stringify(selected)}\nHints: ${JSON.stringify(graph.diagnostics.filter((d) => files.includes(d.file)).slice(0, 8))}\nFailure: ${budget(failure, 300)}\n`;
  for (const file of files) {
    const remaining = 6500 - context.length;
    if (remaining < 200) break;
    const source = await ws.read(file);
    const lines = source.split("\n");
    const start =
      selected?.file === file && source.length > remaining
        ? Math.max(0, selected.line - 45)
        : 0;
    context += `\nFILE ${file} (starting at line ${start + 1})\n${redact(lines.slice(start).join("\n").slice(0, remaining))}\n`;
  }
  return budget(context, 2700);
}
