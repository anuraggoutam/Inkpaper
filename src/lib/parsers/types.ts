export interface ImportResult {
  text: string;
  /** Non-fatal notes shown to the user (e.g. "tables were flattened"). */
  warnings: string[];
}

export type ImportErrorCode = "too-large" | "unsupported" | "corrupt" | "scanned" | "empty" | "encrypted";

export class ImportError extends Error {
  constructor(
    public readonly code: ImportErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ImportError";
  }
}

export const DEFAULT_MAX_UPLOAD_MB = 20;

export function maxUploadBytes(): number {
  const configured = Number(process.env.NEXT_PUBLIC_INKPAPER_MAX_UPLOAD_MB);
  const mb = Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_MAX_UPLOAD_MB;
  return mb * 1024 * 1024;
}
