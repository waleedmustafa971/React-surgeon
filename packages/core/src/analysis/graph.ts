import { parse } from "@babel/parser";
import traverseModule from "@babel/traverse";
import * as t from "@babel/types";
import path from "node:path";
import type { ProjectGraph, ReactComponent } from "@react-surgeon/shared";
import { Workspace } from "../security/workspace.js";
const traverse =
  typeof traverseModule === "function"
    ? traverseModule
    : (traverseModule as unknown as { default: typeof traverseModule }).default;
export async function analyze(root: string): Promise<ProjectGraph> {
  const ws = new Workspace(root),
    files = (await ws.files()).filter(
      (f) => /\.[jt]sx?$/.test(f) && !f.endsWith(".d.ts"),
    );
  const graph: ProjectGraph = {
    components: [],
    imports: {},
    routes: [],
    diagnostics: [],
  };
  for (const file of files) {
    const source = await ws.read(file);
    let ast;
    try {
      ast = parse(source, {
        sourceType: "unambiguous",
        plugins: ["jsx", "typescript"],
      });
    } catch (e) {
      graph.diagnostics.push({
        file,
        line: 1,
        message: `Parse error: ${(e as Error).message}`,
      });
      continue;
    }
    const imported: string[] = [],
      exported: string[] = [];
    traverse(ast, {
      ImportDeclaration(p) {
        imported.push(p.node.source.value);
      },
      ExportNamedDeclaration(p) {
        const d = p.node.declaration;
        if (t.isFunctionDeclaration(d) && d.id) exported.push(d.id.name);
        if (t.isVariableDeclaration(d))
          for (const v of d.declarations)
            if (t.isIdentifier(v.id)) exported.push(v.id.name);
      },
      ExportDefaultDeclaration() {
        exported.push("default");
      },
    });
    graph.imports[file] = imported.map((spec) => {
      if (!spec.startsWith(".")) return spec;
      const base = path.posix.normalize(
        path.posix.join(path.posix.dirname(file), spec),
      );
      return (
        files.find((f) =>
          [
            base,
            `${base}.tsx`,
            `${base}.ts`,
            `${base}.jsx`,
            `${base}.js`,
            `${base}/index.tsx`,
            `${base}/index.ts`,
          ].includes(f),
        ) ?? spec
      );
    });
    for (const imp of graph.imports[file])
      if (imp.startsWith(".") && !/\.(css|svg|png|jpg|json)$/.test(imp))
        graph.diagnostics.push({
          file,
          line: 1,
          message: `Unresolved relative import: ${imp}`,
        });
    traverse(ast, {
      Function(p) {
        const n = p.node;
        const name =
          "id" in n && t.isIdentifier(n.id)
            ? n.id.name
            : t.isVariableDeclarator(p.parent) && t.isIdentifier(p.parent.id)
              ? p.parent.id.name
              : p.parentPath?.isExportDefaultDeclaration()
                ? "DefaultExport"
                : "";
        if (!/^[A-Z]|^use[A-Z]/.test(name)) return;
        const props = n.params.flatMap((v) =>
          t.isObjectPattern(v)
            ? v.properties.flatMap((k) =>
                t.isObjectProperty(k) && t.isIdentifier(k.key)
                  ? [k.key.name]
                  : [],
              )
            : t.isIdentifier(v)
              ? [v.name]
              : [],
        );
        const c: ReactComponent = {
          name,
          file,
          line: n.loc?.start.line ?? 1,
          column: n.loc?.start.column ?? 0,
          props,
          imports: imported,
          exports: exported,
          hooks: [],
          children: [],
          parents: [],
          state: [],
          events: [],
        };
        p.traverse({
          CallExpression(q) {
            const cal = q.node.callee;
            const hook = t.isIdentifier(cal)
              ? cal.name
              : t.isMemberExpression(cal) && t.isIdentifier(cal.property)
                ? cal.property.name
                : "";
            if (/^use[A-Z]/.test(hook))
              c.hooks.push({ name: hook, line: q.node.loc?.start.line ?? 1 });
            if (
              hook === "useState" &&
              t.isVariableDeclarator(q.parent) &&
              t.isArrayPattern(q.parent.id)
            ) {
              for (const el of q.parent.id.elements)
                if (t.isIdentifier(el)) c.state.push(el.name);
            }
            if (hook === "useEffect" && q.node.arguments.length < 2)
              graph.diagnostics.push({
                file,
                line: q.node.loc?.start.line ?? 1,
                message:
                  "Effect without dependency array; inspect state updates for repeated renders.",
              });
            for (let i = 0; i < c.state.length; i += 2) {
              const state = c.state[i],
                setter = c.state[i + 1];
              if (
                hook === setter &&
                t.isIdentifier(q.node.arguments[0], { name: state })
              )
                graph.diagnostics.push({
                  file,
                  line: q.node.loc?.start.line ?? 1,
                  message: `${setter} receives the existing ${state} reference; check for direct mutation.`,
                });
              if (hook === "useEffect") {
                const callback = q.get("arguments")[0],
                  deps = q.node.arguments[1];
                if (callback && t.isArrayExpression(deps)) {
                  let reads = false,
                    updates = false;
                  callback.traverse({
                    ReferencedIdentifier(r) {
                      if (r.node.name === state) reads = true;
                    },
                    CallExpression(r) {
                      if (t.isIdentifier(r.node.callee, { name: setter }))
                        updates = true;
                    },
                  });
                  const listed = deps.elements.some((el) =>
                    t.isIdentifier(el, { name: state }),
                  );
                  if (reads && !listed)
                    graph.diagnostics.push({
                      file,
                      line: q.node.loc?.start.line ?? 1,
                      message: `Effect reads ${state} without listing it in dependencies; possible stale closure.`,
                    });
                  if (updates && listed)
                    graph.diagnostics.push({
                      file,
                      line: q.node.loc?.start.line ?? 1,
                      message: `Effect updates ${state} and depends on it; inspect for an update cycle.`,
                    });
                }
              }
            }
          },
          JSXOpeningElement(q) {
            if (
              t.isJSXIdentifier(q.node.name) &&
              /^[A-Z]/.test(q.node.name.name)
            )
              c.children.push(q.node.name.name);
            for (const a of q.node.attributes)
              if (t.isJSXAttribute(a) && /^on[A-Z]/.test(a.name.name as string))
                c.events.push(source.slice(a.start ?? 0, a.end ?? 0));
          },
        });
        c.children = [...new Set(c.children)];
        graph.components.push(c);
      },
      JSXOpeningElement(p) {
        if (t.isJSXIdentifier(p.node.name) && p.node.name.name === "Route")
          for (const a of p.node.attributes)
            if (
              t.isJSXAttribute(a) &&
              a.name.name === "path" &&
              t.isStringLiteral(a.value)
            )
              graph.routes.push(a.value.value);
      },
      CallExpression(p) {
        const c = p.node.callee;
        if (
          t.isMemberExpression(c) &&
          t.isIdentifier(c.property, { name: "map" })
        ) {
          const callback = p.node.arguments[0];
          if (
            t.isArrowFunctionExpression(callback) &&
            t.isJSXElement(callback.body) &&
            !callback.body.openingElement.attributes.some(
              (a) => t.isJSXAttribute(a) && a.name.name === "key",
            )
          )
            graph.diagnostics.push({
              file,
              line: callback.loc?.start.line ?? 1,
              message:
                "Mapped JSX element has no key; list identity may be unstable.",
            });
        }
        if (
          t.isMemberExpression(c) &&
          t.isIdentifier(c.object) &&
          t.isIdentifier(c.property) &&
          ["push", "pop", "splice", "sort", "reverse"].includes(c.property.name)
        )
          graph.diagnostics.push({
            file,
            line: p.node.loc?.start.line ?? 1,
            message: `Possible mutation: ${c.object.name}.${c.property.name}; check whether this is React state.`,
          });
      },
      JSXAttribute(p) {
        if (
          p.node.name.name === "key" &&
          t.isJSXExpressionContainer(p.node.value) &&
          t.isIdentifier(p.node.value.expression) &&
          /^(i|idx|index)$/.test(p.node.value.expression.name)
        )
          graph.diagnostics.push({
            file,
            line: p.node.loc?.start.line ?? 1,
            message: "Index key can break identity when a list changes order.",
          });
      },
    });
  }
  for (const c of graph.components)
    c.parents = graph.components
      .filter(
        (p) =>
          p.children.includes(c.name) &&
          (p.file === c.file || graph.imports[p.file]?.includes(c.file)),
      )
      .map((p) => p.name);
  return graph;
}
export function relatedFiles(graph: ProjectGraph, file: string) {
  const own = graph.components.filter((c) => c.file === file);
  return [
    ...new Set([
      file,
      ...(graph.imports[file] ?? []).filter((f) => f in graph.imports),
      ...graph.components
        .filter((c) =>
          own.some(
            (o) => o.children.includes(c.name) || o.parents.includes(c.name),
          ),
        )
        .map((c) => c.file),
    ]),
  ];
}
export function xray(graph: ProjectGraph) {
  const render = (
    c: ReactComponent,
    depth: number,
    seen: Set<string>,
  ): string => {
    const key = `${c.file}:${c.name}`;
    if (seen.has(key) || depth > 8)
      return `${"  ".repeat(depth)}${c.name} (reference)`;
    const next = new Set(seen).add(key);
    return (
      `${"  ".repeat(depth)}${c.name} — ${c.file}:${c.line} [${c.hooks.map((h) => h.name).join(", ")}]\n` +
      c.children
        .map((n) => graph.components.find((v) => v.name === n))
        .filter((v): v is ReactComponent => !!v)
        .map((v) => render(v, depth + 1, next))
        .join("\n")
    );
  };
  return graph.components
    .filter((c) => !c.parents.length)
    .map((c) => render(c, 0, new Set()))
    .join("\n");
}
