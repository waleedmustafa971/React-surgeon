import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  Workspace,
  detectProject,
  analyze,
  parseAction,
  budget,
  buildContext,
  matchingRange,
  PatchEngine,
  parseBuildOutput,
  saveProof,
  localURL,
  extractJsonText,
  injectPlugin,
  describeProvider,
  configSchema,
} from "@react-surgeon/core";
import { instrument } from "@react-surgeon/vite-plugin";
import type { Scenario, VerificationResult } from "@react-surgeon/shared";
let root: string;
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "surgeon-test-"));
  await fs.mkdir(path.join(root, "src"));
  await fs.writeFile(
    path.join(root, "package.json"),
    JSON.stringify({
      dependencies: { react: "19.2.0", vite: "6.4.0" },
      scripts: { build: "vite build" },
    }),
  );
  await fs.writeFile(
    path.join(root, "src/App.tsx"),
    "import {useState} from 'react'; import {Child} from './Child'; export function App({title}:{title:string}){const [count,setCount]=useState(0);return <div><Child/><button onClick={()=>setCount(count+2)}>{title}{count}</button></div>}",
  );
  await fs.writeFile(
    path.join(root, "src/Child.tsx"),
    "export function Child(){return <span>Hello</span>}",
  );
});
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});
describe("React intelligence", () => {
  it("matches whitespace-only differences without changing literal content or accepting ambiguous code", () => {
    const source = "function action() {\n  update(value + 2);\n}";
    expect(
      matchingRange(source, "function action() { update(value + 2); }"),
    ).toEqual([0, source.length]);
    expect(() =>
      matchingRange('const text = "a  b";', 'const text = "a b";'),
    ).toThrow();
    expect(() =>
      matchingRange(
        "update( value + 2 ); update( value + 2 );",
        "update(value + 2);",
      ),
    ).toThrow();
  });
  it("does not feed unrelated component bugs into selected repair context", async () => {
    await fs.writeFile(
      path.join(root, "src/Unrelated.tsx"),
      "export function Unrelated(){return <button>Other bug</button>}",
    );
    const context = await buildContext(
      new Workspace(root),
      await detectProject(root),
      await analyze(root),
      "Each click should add one item",
      { file: "src/App.tsx", line: 1, column: 1, text: "Add", route: "/" },
    );
    expect(context).toContain("FILE src/App.tsx");
    expect(context).not.toContain("Unrelated");
  });
  it("detects lockfile package managers", async () => {
    await fs.writeFile(path.join(root, "pnpm-lock.yaml"), "lockfileVersion: 9");
    expect((await detectProject(root)).packageManager).toBe("pnpm");
  });
  it("finds missing list keys and stale effect state", async () => {
    await fs.writeFile(
      path.join(root, "src/Bad.tsx"),
      "import {useState,useEffect} from 'react';export function Bad(){const [items,setItems]=useState([]);useEffect(()=>{console.log(items)},[]);return <ul>{items.map(item=><li>{item}</li>)}</ul>}",
    );
    const hints = (await analyze(root)).diagnostics
      .map((d) => d.message)
      .join("\n");
    expect(hints).toContain("no key");
    expect(hints).toContain("stale closure");
  });
  it("detects React and available scripts", async () => {
    const p = await detectProject(root);
    expect(p.react).toBe("19.2.0");
    expect(p.language).toBe("TypeScript");
    expect(p.features).toContain("vite");
  });
  it("rejects non React projects", async () => {
    await fs.writeFile(path.join(root, "package.json"), "{}");
    await expect(detectProject(root)).rejects.toThrow("Not a React");
  });
  it("extracts components, hooks, state, props and resolved import relationships", async () => {
    const g = await analyze(root),
      app = g.components.find((c) => c.name === "App")!;
    expect(app.props).toEqual(["title"]);
    expect(app.hooks[0].name).toBe("useState");
    expect(app.state).toEqual(["count", "setCount"]);
    expect(app.children).toContain("Child");
    expect(g.imports["src/App.tsx"]).toContain("src/Child.tsx");
    expect(g.components.find((c) => c.name === "Child")!.parents).toEqual([
      "App",
    ]);
  });
});
describe("filesystem and patch security", () => {
  it.each([
    "../outside",
    "C:/Windows/test",
    ".env",
    ".env.local",
    ".ssh/id_rsa",
    "src/test.pem",
    "node_modules/a.js",
  ])("rejects %s", async (p) => {
    await expect(new Workspace(root).resolve(p, true)).rejects.toThrow();
  });
  it("rejects a symlink escape", async () => {
    const target = await fs.mkdtemp(path.join(os.tmpdir(), "surgeon-outside-"));
    try {
      await fs.symlink(target, path.join(root, "escape"), "junction");
      await expect(
        new Workspace(root).resolve("escape/new.ts", true),
      ).rejects.toThrow("Symlink");
    } finally {
      await fs.rm(target, { recursive: true, force: true });
    }
  });
  it("applies minimal patches, records diff, restores original", async () => {
    const ws = new Workspace(root),
      patch = new PatchEngine(ws);
    await patch.apply("src/App.tsx", "count+2", "count+1");
    expect(await ws.read("src/App.tsx")).toContain("count+1");
    expect((await patch.changes())[0].added).toBe(1);
    await patch.undo();
    expect(await ws.read("src/App.tsx")).toContain("count+2");
  });
  it("rejects stale patches", async () => {
    await expect(
      new PatchEngine(new Workspace(root)).apply(
        "src/App.tsx",
        "not present",
        "replacement",
      ),
    ).rejects.toThrow("exactly once");
  });
});
describe("protocol and verification", () => {
  it("accepts valid action and rejects arbitrary shell tools and extra keys", () => {
    expect(parseAction('{"type":"complete","summary":"diagnosis"}').type).toBe(
      "complete",
    );
    expect(() =>
      parseAction('{"type":"tool","tool":"shell","arguments":{}}'),
    ).toThrow();
    expect(() =>
      parseAction('{"type":"complete","summary":"x","command":"rm"}'),
    ).toThrow();
    expect(() => parseAction("```json\n{}\n```")).toThrow();
  });
  it("budgets context conservatively", () => {
    expect(budget("x".repeat(20000), 100).length).toBe(250);
  });
  it("extracts relevant build errors", () => {
    expect(
      parseBuildOutput(
        "noise\nsrc/App.tsx(5,2): error TS2322: bad\nmore noise",
      ),
    ).toBe("src/App.tsx(5,2): error TS2322: bad");
  });
  it("instruments DOM source without touching component props", () => {
    const r = instrument(
      "const App=()=> <div><Child/><button>Go</button></div>",
      path.join(root, "src/App.tsx"),
      root,
    )!;
    expect(r.code).toContain('data-react-surgeon-source="src/App.tsx:1:');
    expect(r.code).toContain("<Child/>");
    expect(r.map).toBeDefined();
  });
  it("confines browser URLs", () => {
    expect(localURL("/test", "http://127.0.0.1:5173")).toContain("/test");
    expect(() => localURL("https://example.com")).toThrow();
    expect(() => localURL("file:///etc/passwd")).toThrow();
  });
  it("persists failed proof honestly", async () => {
    const verification: VerificationResult = {
      static: [],
      runtime: {
        status: "skipped",
        url: "",
        consoleErrors: [],
        pageErrors: [],
        failedRequests: [],
        assertions: 0,
        state: "",
      },
      verified: false,
    };
    const scenario: Scenario = {
      name: "test",
      baseURL: "http://127.0.0.1:5173",
      steps: [{ action: "navigate", url: "/" }],
    };
    const p = await saveProof(root, "test", [], verification, scenario);
    expect(p.status).toBe("BLOCKED");
    expect(
      JSON.parse(
        await fs.readFile(
          path.join(root, ".react-surgeon/proofs/latest.json"),
          "utf8",
        ),
      ).id,
    ).toBe(p.id);
  });
});

describe("model response normalisation", () => {
  it("passes bare JSON through untouched", () => {
    expect(extractJsonText('{"type":"complete","summary":"x"}')).toBe(
      '{"type":"complete","summary":"x"}',
    );
  });
  it("unwraps a fenced block, which some OpenAI-compatible servers emit", () => {
    const fenced = '```json\n{"type":"complete","summary":"x"}\n```';
    expect(JSON.parse(extractJsonText(fenced)).type).toBe("complete");
  });
  it("unwraps a fence with no language tag", () => {
    expect(JSON.parse(extractJsonText('```\n{"a":1}\n```')).a).toBe(1);
  });
  it("recovers an object surrounded by prose", () => {
    expect(
      JSON.parse(extractJsonText('Sure!\n{"a":1}\nHope that helps.')).a,
    ).toBe(1);
  });
  it("lets parseAction accept a fenced action", () => {
    const action = parseAction(
      '```json\n{"type":"complete","summary":"ok"}\n```',
    );
    expect(action.type).toBe("complete");
  });
});

describe("project init", () => {
  it("puts surgeon() before the React plugin", () => {
    const source =
      'import { defineConfig } from "vite";\nimport react from "@vitejs/plugin-react";\nexport default defineConfig({ plugins: [react()] });\n';
    const out = injectPlugin(source)!;
    expect(out).toContain('import surgeon from "@react-surgeon/vite-plugin"');
    expect(out.indexOf("surgeon()")).toBeLessThan(out.indexOf("react()"));
  });
  it("refuses to edit a config it already registers in", () => {
    expect(
      injectPlugin(
        'import surgeon from "@react-surgeon/vite-plugin";\nexport default { plugins: [surgeon()] };',
      ),
    ).toBeUndefined();
  });
  it("refuses to guess when there is no plugins array", () => {
    expect(injectPlugin("export default {};")).toBeUndefined();
  });
});

describe("model providers", () => {
  it("defaults to the bundled runtime so nothing must be on PATH", () => {
    expect(configSchema.parse({}).model.provider).toBe("node-llama-cpp");
  });
  it("describes where inference will happen", () => {
    const local = configSchema.parse({}).model;
    expect(describeProvider(local)).toContain("bundled");
    expect(
      describeProvider({ ...local, provider: "openai-compatible" }),
    ).toContain("127.0.0.1");
  });
  it("keeps inference local unless remote is explicitly allowed", () => {
    expect(configSchema.parse({}).model.allowRemote).toBe(false);
  });
});
