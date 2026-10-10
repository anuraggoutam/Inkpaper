"use client";

import { safePdfFileName } from "@/lib/pdf/filename";
import type { RenderSettings } from "@/lib/validation/schema";
import type { AssignmentDocument } from "@/types/document";

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/** The server can't print here (e.g. on Vercel, or Chromium isn't installed): use the browser instead. */
class ServerExportUnavailable extends Error {}

export type ExportMethod = "download" | "print";

/**
 * Server (Chromium) export is used when InkPaper runs on the user's own machine.
 * Hosted deployments print in the browser. NEXT_PUBLIC_INKPAPER_EXPORT=browser|server overrides this.
 */
function preferServerExport(): boolean {
  const forced = process.env.NEXT_PUBLIC_INKPAPER_EXPORT;
  if (forced === "browser") return false;
  if (forced === "server") return true;
  return LOCAL_HOSTNAMES.has(window.location.hostname);
}

/** Ask the local InkPaper server to print the document, and check that a real PDF came back. */
export async function requestPdf(doc: AssignmentDocument, settings: RenderSettings): Promise<Blob> {
  let response: Response;
  try {
    response = await fetch("/api/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ document: doc, settings }),
    });
  } catch {
    throw new Error("Could not reach the local InkPaper server. Make sure `npm run dev` (or `npm start`) is still running.");
  }
  // 501: server export disabled on this deployment. 503: Chromium not installed locally.
  if (response.status === 501 || response.status === 503) throw new ServerExportUnavailable();
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Export failed (HTTP ${response.status}).`);
  }
  const blob = await response.blob();
  const head = new TextDecoder().decode(await blob.slice(0, 5).arrayBuffer());
  if (blob.size === 0 || head !== "%PDF-") throw new Error("The exported file was not a valid PDF.");
  return blob;
}

/** Save a blob through the browser's normal download flow, then release its object URL. */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

declare global {
  interface Window {
    /** Read by the /print page inside the hidden iframe (same origin; never sent anywhere). */
    __INKPAPER_PRINT_PAYLOAD__?: unknown;
  }
}

/**
 * Print the document with the browser's own engine: the /print page (same renderer as the
 * preview) loads in a hidden iframe and opens the print dialog, where the user picks "Save as PDF".
 * Nothing leaves the browser.
 */
export async function printInBrowser(doc: AssignmentDocument, settings: RenderSettings): Promise<void> {
  window.__INKPAPER_PRINT_PAYLOAD__ = { document: doc, settings };
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.tabIndex = -1;
  Object.assign(iframe.style, {
    position: "fixed",
    right: "0",
    bottom: "0",
    width: "210mm",
    height: "297mm",
    border: "0",
    opacity: "0",
    pointerEvents: "none",
    zIndex: "-1",
  });
  iframe.src = "/print";
  document.body.appendChild(iframe);

  const remove = () => {
    iframe.remove();
    delete window.__INKPAPER_PRINT_PAYLOAD__;
  };

  try {
    const deadline = Date.now() + 60_000;
    let status = iframe.contentWindow?.__INKPAPER_STATUS__;
    while (!status) {
      if (Date.now() > deadline) throw new Error("Preparing the pages for printing took too long. Please try again.");
      await new Promise((resolve) => setTimeout(resolve, 100));
      status = iframe.contentWindow?.__INKPAPER_STATUS__;
    }
    if (!status.ok) throw new Error(`Could not prepare the pages: ${status.error}`);

    const frameWindow = iframe.contentWindow!;
    // Some browsers return from print() immediately, so clean up after the dialog closes.
    frameWindow.addEventListener("afterprint", () => setTimeout(remove, 500), { once: true });
    setTimeout(remove, 10 * 60_000);
    frameWindow.focus();
    frameWindow.print();
  } catch (error) {
    remove();
    throw error;
  }
}

/** Export the PDF: direct download from the local server when available, otherwise the browser's print dialog. */
export async function exportPdf(doc: AssignmentDocument, settings: RenderSettings): Promise<ExportMethod> {
  if (preferServerExport()) {
    try {
      const blob = await requestPdf(doc, settings);
      downloadBlob(blob, safePdfFileName(doc.title));
      return "download";
    } catch (error) {
      if (!(error instanceof ServerExportUnavailable)) throw error;
    }
  }
  await printInBrowser(doc, settings);
  return "print";
}
