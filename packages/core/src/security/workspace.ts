import fs from "node:fs/promises";
import path from "node:path";
const blocked =
  /(^|\/)(\.env(?:\..*)?|\.git|\.react-surgeon|\.ssh|node_modules|dist|\.aws|\.azure|credentials?(?:\..*)?|.*\.(?:pem|key|p12)|id_rsa|id_ed25519|Login Data)(\/|$)/i;
export class Workspace {
  constructor(public root: string) {
    this.root = path.resolve(root);
  }
  async resolve(relative: string, write = false): Promise<string> {
    if (
      !relative ||
      path.isAbsolute(relative) ||
      relative.includes(":") ||
      blocked.test(relative.replaceAll("\\", "/"))
    )
      throw new Error("Protected or invalid workspace path");
    const root = await fs.realpath(this.root),
      target = path.resolve(root, relative);
    const inside = (p: string) => p === root || p.startsWith(root + path.sep);
    if (!inside(target)) throw new Error("Path escapes workspace");
    let cursor = target;
    while (true) {
      try {
        const real = await fs.realpath(cursor);
        if (!inside(real)) throw new Error("Symlink escapes workspace");
        if (blocked.test(path.relative(root, real).replaceAll("\\", "/")))
          throw new Error("Canonical path targets protected data");
        break;
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
        if (!write) throw e;
        cursor = path.dirname(cursor);
      }
    }
    return target;
  }
  async read(p: string) {
    const file = await this.resolve(p);
    if ((await fs.stat(file)).size > 200_000)
      throw new Error("File exceeds context safety limit");
    return fs.readFile(file, "utf8");
  }
  async write(p: string, content: string) {
    const file = await this.resolve(p, true);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, content);
  }
  async files(dir = ".", depth = 0): Promise<string[]> {
    if (depth > 12) return [];
    const target = await this.resolve(dir);
    const out: string[] = [];
    for (const item of await fs.readdir(target, { withFileTypes: true })) {
      const rel = path.join(dir, item.name).replaceAll("\\", "/");
      if (
        item.isSymbolicLink() ||
        blocked.test(rel) ||
        item.name === ".react-surgeon" ||
        item.name.startsWith(".")
      )
        continue;
      if (item.isDirectory()) out.push(...(await this.files(rel, depth + 1)));
      else if (/\.(?:[cm]?[jt]sx?|css|json)$/.test(item.name)) out.push(rel);
      if (out.length > 5000) throw new Error("Workspace file limit exceeded");
    }
    return out;
  }
}
export function redact(text: string) {
  return text
    .replace(
      /((?:password|secret|token|api[_-]?key)\s*[=:]\s*)[^\s,;]+/gi,
      "$1[REDACTED]",
    )
    .replace(/(?:sk-[\w-]{16,}|gh[pousr]_[\w]{20,})/g, "[REDACTED]");
}
