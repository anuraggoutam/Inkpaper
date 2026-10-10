import type { Browser } from "playwright";
import type { ExportPayload } from "@/lib/validation/schema";

export class ExportError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ExportError";
  }
}

const globalForBrowser = globalThis as unknown as { __inkpaperBrowser?: Promise<Browser> };

async function getBrowser(): Promise<Browser> {
  const existing = globalForBrowser.__inkpaperBrowser;
  if (existing) {
    const browser = await existing.catch(() => null);
    if (browser?.isConnected()) return browser;
  }
  const launching = (async () => {
    const { chromium } = await import("playwright");
    return chromium.launch({ headless: true });
  })();
  globalForBrowser.__inkpaperBrowser = launching;
  try {
    return await launching;
  } catch (error) {
    globalForBrowser.__inkpaperBrowser = undefined;
    const message = error instanceof Error ? error.message : String(error);
    if (/Executable doesn't exist|browserType\.launch|install/i.test(message)) {
      throw new ExportError(
        "Chromium for PDF export is not installed. Stop the app, run `npx playwright install chromium` in the project folder, then start it again.",
        503,
      );
    }
    throw new ExportError("Could not start the local Chromium used for PDF export.", 500);
  }
}

/**
 * Render the document through the app's own /print page in headless Chromium and print it to PDF.
 * Only same-origin (local) requests are allowed; everything else is blocked.
 */
export async function renderPdf(payload: ExportPayload, origin: string): Promise<Uint8Array> {
  const browser = await getBrowser();
  const context = await browser.newContext({ javaScriptEnabled: true, serviceWorkers: "block" });
  try {
    await context.route("**/*", (route) => {
      const url = route.request().url();
      if (url.startsWith(`${origin}/`) || url.startsWith("data:")) return route.continue();
      return route.abort("blockedbyclient");
    });
    const page = await context.newPage();
    await page.addInitScript((data) => {
      (window as unknown as { __INKPAPER_PAYLOAD__: unknown }).__INKPAPER_PAYLOAD__ = data;
    }, payload);
    await page.emulateMedia({ media: "print" });
    await page.goto(`${origin}/print`, { waitUntil: "load", timeout: 90_000 });

    const handle = await page
      .waitForFunction(() => (window as unknown as { __INKPAPER_STATUS__?: unknown }).__INKPAPER_STATUS__, null, { timeout: 90_000 })
      .catch(() => {
        throw new ExportError("The print renderer did not finish in time. Try again, or reduce the document size.", 504);
      });
    const status = (await handle.jsonValue()) as { ok: boolean; error?: string };
    if (!status.ok) throw new ExportError(`PDF rendering failed: ${status.error ?? "unknown error"}`, 500);

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });
    const bytes = new Uint8Array(pdf);
    if (bytes.length < 100 || new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-") {
      throw new ExportError("Chromium returned an invalid PDF.", 500);
    }
    return bytes;
  } finally {
    await context.close().catch(() => undefined);
  }
}
