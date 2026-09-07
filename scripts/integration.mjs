import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import {
  Agent,
  Bridge,
  Workspace,
  config,
  LlamaCppProvider,
  detectProject,
  ResourceManager,
  withApp,
  cleanup,
  replay,
} from "../packages/core/dist/index.js";
const root = path.resolve("examples/buggy-react-app");
const settings = await config(root);
// Reuse the downloaded model cache without downloading another copy for the demo.
const cacheRoot = path.resolve(".");
const model = new LlamaCppProvider(cacheRoot, settings.model, console.log);
const resources = new ResourceManager(model),
  project = await detectProject(root);
const bridge = new Bridge(
  new Workspace(root),
  settings.bridgePort,
  settings.appURL,
);
let browser;
let selected;
try {
  await bridge.start();
  await withApp(project, settings.appURL, resources, async () => {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`${settings.appURL}/?reactSurgeonToken=${bridge.token}`);
    await page.getByText("Connected", { exact: true }).waitFor();
    await page
      .locator("#react-surgeon-overlay")
      .getByRole("button", { name: "Select UI", exact: true })
      .click();
    const button = page.getByRole("button", {
      name: "Add to Cart",
      exact: true,
    });
    await button.hover();
    assert.equal(
      await page.locator("#react-surgeon-overlay").locator(".box").isVisible(),
      true,
      "hover highlight",
    );
    const event = new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("No source selection received")),
        8000,
      );
      bridge.once("selection", (s) => {
        clearTimeout(timer);
        resolve(s);
      });
    });
    await button.click();
    selected = await event;
    assert.match(selected.file, /ProductCard\.tsx$/);
    assert.ok(selected.line > 0);
    assert.equal(
      await page.getByTestId("cart-count").innerText(),
      "0",
      "selection must prevent the original click",
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS: overlay, highlight, selection bridge, source location, click suppression",
    );
    await page
      .locator("#react-surgeon-overlay")
      .getByRole("button", { name: "Record", exact: true })
      .click();
    await button.click();
    const recorded = new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Recording not received")),
        5000,
      );
      bridge.once("recording", (steps) => {
        clearTimeout(timer);
        resolve(steps);
      });
    });
    await page
      .locator("#react-surgeon-overlay")
      .getByRole("button", { name: "Stop recording", exact: true })
      .click();
    const steps = await recorded;
    assert.ok(
      steps.some((s) => s.action === "click" && s.name === "Add to Cart"),
    );
    console.log("PASS: reproduction recorder");
    await fs.mkdir("dist", { recursive: true });
    await page.screenshot({ path: "dist/demo-preview.png", fullPage: true });
    await browser.close();
    browser = undefined;
    const unasserted = await replay({
      name: "No assertions",
      baseURL: settings.appURL,
      steps: [{ action: "navigate", url: "/" }],
    });
    assert.equal(unasserted.status, "failed");
    assert.match(unasserted.error, /no acceptance assertions/);
    console.log("PASS: replay without assertions cannot verify");
  });
  await bridge.stop();
  const scenario = JSON.parse(
    await fs.readFile(path.join(root, "scenarios/cart.json"), "utf8"),
  );
  const agent = new Agent(root, model, console.log);
  const proof = await agent.fix("Each click should add one item", scenario, {
    ...selected,
    file: "src/components/Login.tsx",
    name: "Sign in",
    route: "/login",
  });
  assert.equal(proof.status, "VERIFIED", JSON.stringify(proof.verification));
  assert.equal(proof.baseline.status, "failed");
  assert.equal(proof.baseline.source.file, selected.file);
  assert.deepEqual(
    proof.changes.map((change) => change.path),
    [selected.file],
  );
  assert.ok(proof.verification.runtime.assertions >= 3);
  for (const file of await fs.readdir(path.join(root, "dist/assets")))
    if (file.endsWith(".js")) {
      const source = await fs.readFile(
        path.join(root, "dist/assets", file),
        "utf8",
      );
      assert.ok(!source.includes("data-react-surgeon-source"));
      assert.ok(!source.includes("react-surgeon-overlay"));
    }
  console.log("PASS: production bundle has no Surgeon instrumentation");
  console.log(
    "PASS: real Qwen patch, build/lint/tests, browser replay and proof",
    proof.id,
  );
  await fs.mkdir("dist", { recursive: true });
  await fs.writeFile(
    "dist/integration-proof.json",
    JSON.stringify(proof, null, 2),
  );
  // Keep this a repeatable bug lab. The verified evidence and diff remain in dist.
  await agent.patches.undo();
  console.log("Demo bug restored for the next Click → Fix demonstration.");
} finally {
  await browser?.close();
  await bridge.stop().catch(() => {});
  await model.stop();
  await cleanup();
}
