import { chromium } from "playwright-core";
import GIFEncoder from "gif-encoder-2";
import { PNG } from "pngjs";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

/**
 * Records the README demo: the counter bug, then click-to-source selection.
 *
 * Driven by Playwright rather than by hand so the result is reproducible —
 * a fixed viewport means every frame is the same size and the layout never
 * shifts between captures.
 *
 * Prerequisites: `npm run demo` in one terminal and
 * `npm run surgeon -- --project examples/buggy-react-app start` in another.
 * Pass the session URL that `start` prints, since the overlay needs its token.
 *
 *   node scripts/record-demo.mjs "http://127.0.0.1:5173/?reactSurgeonToken=..." assets/media/select-element.gif
 */
const url = process.argv[2];
const out = process.argv[3] ?? "assets/media/select-element.gif";
if (!url) {
  console.error(
    "usage: node scripts/record-demo.mjs <session-url-from-start> [out.gif]",
  );
  process.exit(1);
}

const WIDTH = 1100,
  HEIGHT = 620;
const frames = [];

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);

  /** Captures the viewport, repeated to hold the moment on screen. */
  const shot = async (hold = 1) => {
    const png = PNG.sync.read(await page.screenshot({ type: "png" }));
    for (let i = 0; i < hold; i++) frames.push(png.data);
  };

  await page.goto(url);
  await page.waitForSelector("[data-testid=cart-count]");
  await page.evaluate(() =>
    document
      .querySelector("[data-testid=cart-count]")
      ?.scrollIntoView({ block: "center" }),
  );
  await page.waitForTimeout(700);

  const addToCart = page.getByRole("button", {
    name: "Add to Cart",
    exact: true,
  });

  await shot(6);

  // The defect: one click adds two.
  for (const hold of [5, 6]) {
    await addToCart.click();
    await page.waitForTimeout(400);
    await shot(hold);
  }

  // Selection mode maps the same button back to its JSX.
  await page.getByText("Select UI", { exact: true }).click();
  await page.waitForTimeout(350);
  await addToCart.hover();
  await page.waitForTimeout(450);
  await shot(5);

  // Selecting reports the source and suppresses the app's own handler,
  // which is why the cart total does not move here.
  await addToCart.click();
  await page.waitForTimeout(800);
  await shot(12);

  const encoder = new GIFEncoder(WIDTH, HEIGHT, "neuquant", true);
  encoder.setDelay(300);
  encoder.setQuality(10);
  encoder.setRepeat(0);
  encoder.start();
  for (const frame of frames) encoder.addFrame(frame);
  encoder.finish();

  const target = path.resolve(out);
  await mkdir(path.dirname(target), { recursive: true });
  const data = encoder.out.getData();
  await writeFile(target, data);
  console.log(
    `Wrote ${out} — ${frames.length} frames, ${WIDTH}x${HEIGHT}, ${Math.round(data.length / 1024)} KB`,
  );
} finally {
  await browser.close();
}
