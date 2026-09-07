import fs from "node:fs/promises";
import { createWriteStream } from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { createRequire } from "node:module";
import Module from "node:module";
import assert from "node:assert/strict";
import yauzl from "yauzl";
import { readFileSync } from "node:fs";
const dest = path.resolve("dist/vsix-check");
await fs.mkdir(dest, { recursive: true });
await new Promise((resolve, reject) =>
  yauzl.open(
    `dist/react-surgeon-${JSON.parse(readFileSync("packages/vscode/package.json", "utf8")).version}.vsix`,
    { lazyEntries: true },
    (error, zip) => {
      if (error) return reject(error);
      zip.on("error", reject);
      zip.on("end", resolve);
      zip.on("entry", (entry) => {
        void (async () => {
          const file = path.resolve(dest, entry.fileName);
          assert.ok(file.startsWith(dest + path.sep));
          if (entry.fileName.endsWith("/"))
            await fs.mkdir(file, { recursive: true });
          else {
            await fs.mkdir(path.dirname(file), { recursive: true });
            const stream = await new Promise((res, rej) =>
              zip.openReadStream(entry, (e, s) => (e ? rej(e) : res(s))),
            );
            await pipeline(stream, createWriteStream(file));
          }
          zip.readEntry();
        })().catch(reject);
      });
      zip.readEntry();
    },
  ),
);
const commands = new Map();
let panel;
const messages = [];
const api = {
  window: {
    createOutputChannel: () => ({
      appendLine: (m) => messages.push(m),
      dispose() {},
    }),
    registerWebviewViewProvider: (_id, p) => {
      panel = p;
      return { dispose() {} };
    },
  },
  workspace: {
    isTrusted: true,
    workspaceFolders: [
      { uri: { fsPath: path.resolve("examples/buggy-react-app") } },
    ],
  },
  commands: {
    registerCommand: (id, fn) => {
      commands.set(id, fn);
      return { dispose() {} };
    },
  },
};
const original = Module._load;
Module._load = function (id, ...args) {
  if (id === "vscode") return api;
  return original.call(this, id, ...args);
};
const require = createRequire(import.meta.url);
const extension = require(path.join(dest, "extension/dist/extension.cjs"));
extension.activate({ subscriptions: [] });
assert.equal(commands.size, 10);
const webview = {
  options: {},
  html: "",
  onDidReceiveMessage() {},
  postMessage() {},
};
panel.resolveWebviewView({ webview });
assert.match(webview.html, /Diagnose &amp; Fix/);
assert.match(webview.html, /Content-Security-Policy/);
await commands.get("reactSurgeon.doctor")();
assert.ok(messages.length);
const { chromium } = require(
  path.join(dest, "extension/runtime/playwright-core/index.js"),
);
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setContent("<button>Packaged runtime works</button>");
assert.equal(
  await page.getByRole("button").innerText(),
  "Packaged runtime works",
);
await browser.close();
await extension.deactivate();
Module._load = original;
console.log(
  "PASS: VSIX extraction, isolated bundled extension activation, 10 commands, sidebar CSP, packaged Chromium runtime.",
);
