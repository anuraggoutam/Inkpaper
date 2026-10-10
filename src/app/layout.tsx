import type { Metadata, Viewport } from "next";
import { fontFaceCss } from "@/lib/handwriting/fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "InkPaper — handwritten assignment studio",
  description: "Turn your typed assignment into clean, handwritten-style A4 pages. Runs entirely on your computer.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        {/* Local, allowlisted handwriting fonts only — no remote font requests. */}
        <style dangerouslySetInnerHTML={{ __html: fontFaceCss() }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
