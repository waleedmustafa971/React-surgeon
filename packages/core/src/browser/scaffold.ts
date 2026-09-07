import { chromium } from "playwright-core";
import type { Scenario, ScenarioStep } from "@react-surgeon/shared";
import { registerCleanup } from "../resources/process.js";
import { localURL, locator } from "./scenario.js";

/**
 * Turns a recorded reproduction into a draft acceptance scenario.
 *
 * Writing the scenario is the part that actually costs a developer time: they
 * must find stable targets and decide what to assert. This does the mechanical
 * half — replay the recording, watch which `data-testid` values and which URL
 * change, and propose an assertion for each — and leaves the judgement half
 * alone. The proposed values are what the app CURRENTLY does, which for a bug
 * report is the wrong answer by definition, so they are labelled for editing
 * rather than presented as acceptance criteria.
 */
export interface ScaffoldResult {
  scenario: Scenario & { _draft?: DraftNotes };
  observations: Observation[];
}
export interface Observation {
  testId: string;
  before: string;
  after: string;
}
interface DraftNotes {
  warning: string;
  editThese: string[];
}

type Snapshot = { testIds: Record<string, string>; url: string };

async function snapshot(page: {
  evaluate: <T>(fn: () => T) => Promise<T>;
  url(): string;
}): Promise<Snapshot> {
  const testIds = await page.evaluate(() => {
    const out: Record<string, string> = {};
    for (const el of Array.from(
      document.querySelectorAll("[data-testid]"),
    ).slice(0, 200)) {
      const id = el.getAttribute("data-testid");
      if (id) out[id] = (el as HTMLElement).innerText.trim().slice(0, 200);
    }
    return out;
  });
  return { testIds, url: page.url() };
}

/** Steps that drive the app rather than assert about it. */
type DriveStep = Exclude<
  ScenarioStep,
  | { action: "assertURL" }
  | { action: "assertText" }
  | { action: "assertVisible" }
>;
function interactionSteps(steps: ScenarioStep[]): DriveStep[] {
  return steps.filter((s): s is DriveStep => !s.action.startsWith("assert"));
}

export async function scaffoldScenario(
  recording: { baseURL: string; steps: ScenarioStep[]; name?: string },
  options: { name?: string } = {},
): Promise<ScaffoldResult> {
  const base = localURL(recording.baseURL);
  const drive = interactionSteps(recording.steps);
  if (!drive.length)
    throw new Error(
      "The recording has no interactions to replay. Record a reproduction first with `react-surgeon start`.",
    );

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

    const first = drive[0];
    await page.goto(
      first.action === "navigate" ? localURL(first.url, base) : base,
    );
    const before = await snapshot(page);

    for (const step of drive) {
      if (step.action === "navigate") {
        await page.goto(localURL(step.url, base));
        continue;
      }
      if (step.action === "reload") {
        await page.reload();
        continue;
      }
      const el = locator(page, step);
      if (step.action === "click") await el.click();
      else if (step.action === "fill") await el.fill(step.value ?? "");
      else if (step.action === "submit")
        await el.evaluate((e) => {
          if (e instanceof HTMLFormElement) e.requestSubmit();
        });
    }
    // Let React commit before reading the result.
    await page.waitForTimeout(400);
    const after = await snapshot(page);

    const observations: Observation[] = Object.keys(after.testIds)
      .filter((id) => before.testIds[id] !== after.testIds[id])
      .map((id) => ({
        testId: id,
        before: before.testIds[id] ?? "(absent)",
        after: after.testIds[id],
      }));

    const steps: ScenarioStep[] = [
      { action: "navigate", url: new URL(before.url).pathname },
      // Assert the starting values so a regression in the initial render fails too.
      ...observations
        .filter((o) => o.before !== "(absent)")
        .map((o): ScenarioStep => ({
          action: "assertText",
          testId: o.testId,
          value: o.before,
        })),
      ...drive.filter((s) => s.action !== "navigate"),
      ...observations.map((o): ScenarioStep => ({
        action: "assertText",
        testId: o.testId,
        value: o.after,
      })),
    ];
    if (after.url !== before.url)
      steps.push({ action: "assertURL", value: new URL(after.url).pathname });

    const editThese = observations.map(
      (o) =>
        `data-testid="${o.testId}" ends at ${JSON.stringify(o.after)} — change it to what it SHOULD be`,
    );
    if (after.url !== before.url)
      editThese.push(
        `URL ends at ${new URL(after.url).pathname} — change it if that is not the expected destination`,
      );

    return {
      observations,
      scenario: {
        name: options.name ?? recording.name ?? "Recorded reproduction",
        baseURL: recording.baseURL,
        steps,
        _draft: {
          warning:
            "These assertions describe what the app currently does, which includes the bug. Edit each value to the expected behaviour before running fix, then delete this block.",
          editThese,
        },
      },
    };
  } finally {
    unregister?.();
    await browser?.close();
  }
}
