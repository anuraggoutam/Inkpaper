import { NextResponse, type NextRequest } from "next/server";
import { safePdfFileName } from "@/lib/pdf/filename";
import { ExportError, renderPdf } from "@/lib/pdf/renderPdf";
import { exportPayloadSchema } from "@/lib/validation/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 2 * 1024 * 1024;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

function error(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function hostnameOf(value: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value.includes("://") ? value : `http://${value}`).hostname;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  const url = request.nextUrl;
  // This is a single-user local tool: only accept requests addressed to (and coming from) localhost.
  const host = hostnameOf(request.headers.get("host"));
  const origin = request.headers.get("origin");
  if (!host || !LOCAL_HOSTS.has(host) || (origin !== null && !LOCAL_HOSTS.has(hostnameOf(origin) ?? ""))) {
    return error("PDF export is only available when InkPaper is opened on this computer (localhost).", 403);
  }

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) return error("The document is too large to export (limit 2 MB of text).", 413);

  let body: unknown;
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) return error("The document is too large to export (limit 2 MB of text).", 413);
    body = JSON.parse(raw);
  } catch {
    return error("The export request was not valid JSON.", 400);
  }

  const parsed = exportPayloadSchema.safeParse(body);
  if (!parsed.success) return error("The export request contained invalid settings or document data.", 400);
  if (parsed.data.document.text.trim() === "" && parsed.data.document.title.trim() === "") {
    return error("The document is empty. Add some text before exporting.", 422);
  }

  // Chromium loads the app's own /print page from the same local server.
  const appOrigin = `${url.protocol}//${url.host}`;
  try {
    const pdf = await renderPdf(parsed.data, appOrigin);
    return new NextResponse(Buffer.from(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${safePdfFileName(parsed.data.document.title)}"`,
        "Content-Length": String(pdf.length),
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    if (err instanceof ExportError) return error(err.message, err.status);
    // Never log document contents; only the failure type.
    console.error("[inkpaper] PDF export failed:", err instanceof Error ? err.name : "unknown");
    return error("PDF export failed unexpectedly. Check the terminal running InkPaper and try again.", 500);
  }
}
