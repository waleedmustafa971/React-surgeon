import path from "node:path";
import { parse } from "@babel/parser";
import traverseModule from "@babel/traverse";
import * as t from "@babel/types";
import MagicString from "magic-string";
import type { Plugin } from "vite";
import { overlay } from "./overlay.js";
const traverse =
  typeof traverseModule === "function"
    ? traverseModule
    : (traverseModule as unknown as { default: typeof traverseModule }).default;
export function instrument(code: string, id: string, root: string) {
  const relative = path.relative(root, id).replaceAll("\\", "/");
  if (relative.startsWith("../") || path.isAbsolute(relative)) return null;
  const ast = parse(code, {
    sourceType: "module",
    plugins: ["jsx", "typescript"],
  });
  const out = new MagicString(code);
  traverse(ast, {
    JSXOpeningElement(p) {
      const n = p.node;
      if (
        !t.isJSXIdentifier(n.name) ||
        !/^[a-z]/.test(n.name.name) ||
        n.attributes.some(
          (a) =>
            t.isJSXAttribute(a) && a.name.name === "data-react-surgeon-source",
        )
      )
        return;
      out.appendLeft(
        n.name.end!,
        ` data-react-surgeon-source=${JSON.stringify(`${relative}:${n.loc!.start.line}:${n.loc!.start.column + 1}`)}`,
      );
    },
  });
  return {
    code: out.toString(),
    map: out.generateMap({ hires: true, source: id, includeContent: true }),
  };
}
export default function reactSurgeon(
  options: { port?: number; token?: string } = {},
): Plugin {
  let root = "";
  return {
    name: "react-surgeon",
    apply: "serve",
    enforce: "pre",
    configResolved(c) {
      root = c.root;
    },
    transform(code, id) {
      const file = id.split("?")[0];
      if (file.includes("node_modules") || !/\.[jt]sx?$/.test(file)) return;
      return instrument(code, file, root);
    },
    transformIndexHtml() {
      return [
        {
          tag: "script",
          attrs: { type: "module" },
          children: overlay(
            options.port ?? 18080,
            options.token ?? process.env.REACT_SURGEON_TOKEN ?? "",
          ),
          injectTo: "body",
        },
      ];
    },
  };
}
