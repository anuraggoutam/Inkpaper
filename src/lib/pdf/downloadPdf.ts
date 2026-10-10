"use client";

import { safePdfFileName } from "@/lib/pdf/filename";
import type { RenderSettings } from "@/lib/validation/schema";
import type { AssignmentDocument } from "@/types/document";

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

export async function exportPdf(doc: AssignmentDocument, settings: RenderSettings): Promise<void> {
  const blob = await requestPdf(doc, settings);
  downloadBlob(blob, safePdfFileName(doc.title));
}
