import { chromium, type Page, type Locator } from "playwright-core";
import { z } from "zod";
import type { Scenario, RuntimeResult } from "@react-surgeon/shared";
import { registerCleanup } from "../resources/process.js";
const target = {
  role: z.string().optional(),
  name: z.string().optional(),
  testId: z.string().optional(),
  selector: z.string().optional(),
  value: z.string().max(2000).optional(),
};
export const scenarioSchema = z.object({
  name: z.string(),
  baseURL: z.string().url(),
  steps: z
    .array(
      z.union([
        z.object({ action: z.literal("navigate"), url: z.string() }),
        z.object({ action: z.literal("reload") }),
        z.object({ action: z.literal("assertURL"), value: z.string() }),
        z.object({
          action: z.enum([
            "click",
            "fill",
            "assertText",
            "assertVisible",
            "submit",
          ]),
          ...target,
        }),
      ]),
    )
    .min(1)
    .max(200),
});
export function localURL(value: string, base?: string) {
  const url = new URL(value, base);
  if (
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error("Browser navigation must stay on localhost");
  return url.toString();
}
export function locator(
  page: Page,
  step: { role?: string; name?: string; testId?: string; selector?: string },
): Locator {
  if (step.testId) return page.getByTestId(step.testId);
  if (step.role)
    return page.getByRole(step.role as Parameters<Page["getByRole"]>[0], {
      name: step.name,
      exact: true,
    });
  if (step.selector) return page.locator(step.selector);
  throw new Error("Step needs an accessible role, test ID, or selector");
}
export async function replay(input: Scenario): Promise<RuntimeResult> {
  const scenario = scenarioSchema.parse(input),
    base = localURL(scenario.baseURL);
  const result: RuntimeResult = {
    status: "failed",
    url: base,
    consoleErrors: [],
    pageErrors: [],
    failedRequests: [],
    assertions: 0,
    state: "",
  };
  let browser;
  let unregister: (() => void) | undefined;
  try {
    browser = await chromium.launch({ headless: true });
    const owned = browser;
    unregister = registerCleanup(() => owned.close());
    const context = await browser.newContext();
    await context.route("**/*", (route) => {
      try {
        localURL(route.request().url());
        return route.continue();
      } catch {
        return route.abort("blockedbyclient");
      }
    });
    const page = await context.newPage();
    page.setDefaultTimeout(6000);
    page.setDefaultNavigationTimeout(15000);
    page.on("console", (m) => {
      if (m.type() === "error")
        result.consoleErrors.push(m.text().slice(0, 500));
    });
    page.on("pageerror", (e) =>
      result.pageErrors.push(e.message.slice(0, 500)),
    );
    page.on("requestfailed", (r) =>
      result.failedRequests.push(
        `${r.method()} ${new URL(r.url()).pathname}: ${r.failure()?.errorText}`,
      ),
    );
    page.on("response", (r) => {
      if (r.status() >= 400)
        result.failedRequests.push(
          `${r.status()} ${new URL(r.url()).pathname}`,
        );
    });
    const deadline = Date.now() + 90000;
    for (const step of scenario.steps) {
      if (Date.now() > deadline)
        throw new Error("Scenario time limit exceeded");
      if (step.action === "navigate") await page.goto(localURL(step.url, base));
      else if (step.action === "reload") await page.reload();
      else if (step.action === "assertURL") {
        const expected = localURL(step.value, base);
        await page.waitForURL(expected, { timeout: 4000 });
        result.assertions++;
      } else {
        const el = locator(page, step);
        if (
          step.action === "click" ||
          step.action === "fill" ||
          step.action === "submit"
        ) {
          const source = await el.evaluate((element) =>
            element
              .closest("[data-react-surgeon-source]")
              ?.getAttribute("data-react-surgeon-source"),
          );
          const match = source?.match(/^(.*):(\d+):(\d+)$/);
          if (match)
            result.source = {
              file: match[1],
              line: Number(match[2]),
              column: Number(match[3]),
              role: step.role,
              name: step.name,
              testId: step.testId,
              text: ((await el.textContent()) ?? "").slice(0, 500),
              route: new URL(page.url()).pathname,
            };
        }
        if (step.action === "click") await el.click();
        else if (step.action === "fill") {
          if (step.value === "[REDACTED]")
            throw new Error(
              "Sensitive recording requires a locally supplied demo value",
            );
          await el.fill(step.value ?? "");
        } else if (step.action === "submit")
          await el.evaluate((e) => {
            if (!(e instanceof HTMLFormElement))
              throw new Error("Expected form");
            e.requestSubmit();
          });
        else if (step.action === "assertVisible") {
          await el.waitFor({ state: "visible" });
          result.assertions++;
        } else if (step.action === "assertText") {
          const expected = step.value ?? "";
          let actual = "";
          const until = Date.now() + 4000;
          do {
            actual = (await el.innerText()).trim();
            if (actual === expected) break;
            await new Promise((r) => setTimeout(r, 100));
          } while (Date.now() < until);
          if (actual !== expected)
            throw new Error(
              `Expected text ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`,
            );
          result.assertions++;
        }
      }
    }
    result.url = page.url();
    result.state = (await page.locator("body").innerText()).slice(0, 2000);
    if (!result.assertions)
      throw new Error(
        "Replay has no acceptance assertions; cannot verify a fix",
      );
    if (
      result.consoleErrors.length ||
      result.pageErrors.length ||
      result.failedRequests.length
    )
      throw new Error("Browser errors were recorded");
    result.status = "passed";
  } catch (e) {
    result.error = (e as Error).message;
  } finally {
    await browser?.close();
    unregister?.();
  }
  return result;
}
