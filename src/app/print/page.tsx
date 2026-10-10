import type { Metadata } from "next";
import { PrintView } from "@/components/export/PrintView";

export const metadata: Metadata = { title: "InkPaper print", robots: { index: false } };

/** Rendered only inside the local headless Chromium used for PDF export. */
export default function PrintPage() {
  return <PrintView />;
}
