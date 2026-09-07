import fs from "node:fs/promises";
import path from "node:path";
import { createPatch, diffLines } from "diff";
import type { FileChange } from "@react-surgeon/shared";
import { Workspace } from "../security/workspace.js";
import { parse } from "@babel/parser";
export function matchingRange(
  source: string,
  oldText: string,
): [number, number] {
  if (!oldText)
    throw new Error("Patch must match exactly once; reread the current file");
  const direct = source.split(oldText).length - 1;
  if (direct === 1) {
    const start = source.indexOf(oldText);
    return [start, start + oldText.length];
  }
  if (direct > 1)
    throw new Error("Patch must match exactly once; reread the current file");
  const tokenize = (text: string) => {
    const ast = parse(text, {
      sourceType: "unambiguous",
      plugins: ["typescript", "jsx"],
      tokens: true,
    });
    return (
      ast.tokens as { type: { label?: string }; start: number; end: number }[]
    )
      .filter((token) => token.type.label !== "eof")
      .map((token) => ({ ...token, raw: text.slice(token.start, token.end) }));
  };
  try {
    const haystack = tokenize(source),
      needle = tokenize(oldText),
      matches: [number, number][] = [];
    if (!needle.length) throw new Error("Empty token sequence");
    for (let i = 0; i <= haystack.length - needle.length; i++)
      if (needle.every((token, j) => token.raw === haystack[i + j].raw))
        matches.push([haystack[i].start, haystack[i + needle.length - 1].end]);
    if (matches.length === 1) return matches[0];
  } catch {
    /* Invalid or ambiguous snippets must never be guessed. */
  }
  throw new Error("Patch must match exactly once; reread the current file");
}
export class PatchEngine {
  private originals = new Map<string, string>();
  constructor(private ws: Workspace) {}
  async apply(file: string, oldText: string, newText: string) {
    if (!/\.(?:[jt]sx?|css)$/.test(file))
      throw new Error("Only React source and CSS patches are permitted");
    const current = await this.ws.read(file);
    const [start, end] = matchingRange(current, oldText);
    if (oldText === newText) throw new Error("Empty patch");
    if (!this.originals.has(file)) this.originals.set(file, current);
    await this.persist();
    await this.ws.write(
      file,
      current.slice(0, start) + newText + current.slice(end),
    );
    return this.changes();
  }
  private async persist() {
    const dir = path.join(this.ws.root, ".react-surgeon");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, "undo.json"),
      JSON.stringify(Object.fromEntries(this.originals)),
    );
  }
  async changes(): Promise<FileChange[]> {
    const out: FileChange[] = [];
    for (const [file, before] of this.originals) {
      const after = await this.ws.read(file),
        parts = diffLines(before, after);
      out.push({
        path: file,
        diff: createPatch(file, before, after),
        added: parts.reduce((n, p) => n + (p.added ? (p.count ?? 0) : 0), 0),
        removed: parts.reduce(
          (n, p) => n + (p.removed ? (p.count ?? 0) : 0),
          0,
        ),
      });
    }
    return out;
  }
  async undo() {
    const saved = JSON.parse(
      await fs.readFile(
        path.join(this.ws.root, ".react-surgeon/undo.json"),
        "utf8",
      ),
    ) as Record<string, string>;
    for (const [file, content] of Object.entries(saved))
      await this.ws.write(file, content);
    this.originals.clear();
  }
}
