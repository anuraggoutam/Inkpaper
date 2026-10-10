# InkPaper — Claude Code Build Specification

> **Goal:** Build a polished, fully local Windows-friendly web app that converts a user's own solved assignment text/PDF/DOCX/TXT into clean, handwritten-style A4 PDF pages.
>
> **Operating mode:** Local-only. No deployment, accounts, cloud storage, analytics, external APIs, telemetry, or paid services. Uploaded content stays on the user's computer. The final output must be a real, printable PDF—not a screenshot of the app.
>
> **Instructions for Claude Code:** Read this entire document before coding. Inspect the existing repository first. Implement the app end-to-end, run it, run checks, and fix issues. Do not stop after producing a plan or mock UI. Make sensible decisions without repeatedly asking the user. Keep the implementation simple, reliable, and visually polished.

---

## 1. Product outcome

Build **InkPaper**, a local-first assignment-to-handwriting studio.

The user should be able to:

1. Start the app on their computer using a documented command.
2. Import a text-based PDF, DOCX, or TXT assignment.
3. Extract content into editable blocks while preserving question numbers, headings, paragraphs, and lists as well as practical.
4. Edit the extracted content and enter optional student/assignment details.
5. Choose handwriting appearance, ink color, paper type, margins, font size, and line spacing.
6. Preview accurate A4 pages in the browser.
7. Export a multi-page PDF that closely matches the preview and prints correctly at A4 size.
8. Reopen the app and use it without an internet connection after dependencies/fonts are installed.

**Quality bar:** readable, natural-looking handwriting style; consistent page layout; no clipped text; predictable page breaks; polished interface; dependable export.

This is a formatting/rendering tool. Do not invent answers or silently rewrite assignment content. Keep original text intact unless the user edits it.

---

## 2. Hard constraints

- Local-only runtime. Do not deploy anything.
- No database, auth, cloud storage, SaaS dependencies, external APIs, telemetry, analytics, or tracking.
- No external network requests at runtime.
- Do not upload documents anywhere.
- Do not persist uploaded content unless the user explicitly chooses an optional local save/export operation. In-memory processing is the default.
- No Docker required.
- No shadcn/ui.
- Use TypeScript with strict mode.
- Never fake a successful export. Show actionable errors if parsing or PDF generation fails.
- Never claim scanned/image-only PDFs are supported unless OCR has actually been implemented and tested.
- Do not bundle fonts unless their license permits redistribution and embedding. Document font licenses. Provide a font setup/readme and use legally redistributable fonts.
- Do not try to exactly imitate a named real person's handwriting. Provide generic handwriting styles only.
- Keep generated PDF selectable/searchable text where possible; do not simply screenshot pages into a PDF.
- Do not introduce random visual variation that makes text overlap, breaks words, or makes pages differ on every render. Use deterministic, bounded variation.

---

## 3. Recommended technology

Use a single Next.js application with local development server and local browser UI.

- Next.js App Router
- React + TypeScript (strict)
- Tailwind CSS for styling; custom components, no shadcn/ui
- `pdfjs-dist` for extracting text from text-based PDF files
- `mammoth` for extracting DOCX content (accept its known limitations)
- TXT via browser File API / UTF-8 parsing
- Zod for validating settings and metadata if useful
- Zustand only if shared state becomes complex; otherwise React state/context
- Playwright + Chromium for server-side PDF export using print CSS
- Vitest for unit tests, and Playwright tests only where worthwhile

Use compatible, stable package versions and commit a lockfile. Avoid unnecessary dependencies.

### Local PDF export design

- Browser UI sends the document model and render settings to a local Next.js API route.
- Validate request payload and enforce a sensible size limit.
- Render only controlled, app-generated HTML. Never execute uploaded HTML or scripts.
- Use Playwright/Chromium to generate the PDF with `page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true })`.
- Bundle fonts locally and wait for `document.fonts.ready` before PDF generation.
- Return the PDF bytes to the browser as a downloadable file.
- Ensure the API is bound/used locally in normal development. Document that the local app is intended for one user's machine.
- Do not use remote font URLs, CDN assets, external images, or network resources in the rendered document.

If Playwright cannot be installed or Chromium is missing, provide clear setup/error instructions and a reproducible install command. Do not silently fall back to a low-quality screenshot export.

---

## 4. UX and visual design

Create a professional desktop-first document studio, responsive enough for smaller screens.

### Visual direction

- Quiet, warm, paper-inspired workspace.
- Neutral off-white/gray app canvas, white paper preview, restrained ink-blue accent.
- Clean typography, clear hierarchy, comfortable spacing.
- Avoid excessive gradients, glassmorphism, oversized marketing hero sections, and decorative animations.
- This is a utility app: the document preview should be the visual focus.
- Use accessible contrast, keyboard focus states, labels, and useful empty/error/loading states.

### Main screen layout

**Top bar**
- InkPaper wordmark
- Current file name / unsaved state
- Import file button
- Export PDF button (primary action)

**Left panel: Content**
- Upload/drop zone before a document is loaded
- Editable assignment title and optional details
- Structured blocks editor (questions/headings/paragraphs/lists)
- Clear error state for unsupported or scanned PDF
- Button to reset content to extracted original (confirm first)

**Center: Page preview**
- Actual A4 portrait pages, stacked vertically
- Realistic ruled or plain paper
- Red/neutral margin line if ruled template uses one
- Handwriting content
- Page number if enabled
- Current page count
- Zoom controls or fit-width toggle
- Empty state explaining how to import a document

**Right panel: Style settings**
- Handwriting font/style selector
- Font size
- Line spacing
- Ink color: blue / black
- Paper: ruled / plain
- Margins
- Variation intensity
- Page numbering toggle
- Reset settings

Panels may collapse on narrower screens. Avoid making the preview tiny on a normal laptop display.

### Interactions

- Drag and drop supported file formats.
- Show selected filename, file size, parsing progress, and meaningful errors.
- Editing content updates preview predictably (debounce if needed).
- Settings update preview without requiring a full page reload.
- Export button shows progress and is disabled during export.
- After export, download `assignment-handwritten.pdf` or a sensible filename based on document title.
- Warn if a document is empty.
- If a PDF appears to contain no extractable text, explain it may be scanned/image-only and is not supported in v1. Do not output an empty PDF without warning.
- Preserve user input during ordinary settings changes.
- Confirm destructive reset actions.

---

## 5. Import and content model

Support these formats in v1:

### TXT
- Read UTF-8 text.
- Preserve paragraph boundaries and blank lines reasonably.
- Handle Windows and Unix newlines.

### DOCX
- Use Mammoth to extract semantic content.
- Preserve headings, paragraphs, ordered/unordered lists where feasible.
- Do not render imported HTML as trusted HTML.
- Convert extracted output into a safe, typed document model.
- Tables and embedded images may be unsupported in v1; display a friendly limitation if relevant rather than silently pretending they were preserved.

### PDF
- Use `pdfjs-dist` to extract text items.
- Group text items into lines/paragraphs using coordinates and reasonable heuristics.
- Preserve reading order as well as practical.
- Detect a likely scanned PDF if no meaningful text is extracted.
- Multi-column PDFs may not extract perfectly; let the user edit content before export.
- Release PDF parser resources after parsing.

### Typed model

Create a document model independent from React and PDF rendering. Suggested model (adjust when implementing):

```ts
type BlockType = "heading" | "paragraph" | "question" | "list";

interface DocumentBlock {
  id: string;
  type: BlockType;
  text: string;
  level?: number;
  listKind?: "ordered" | "unordered";
}

interface AssignmentMetadata {
  studentName: string;
  rollNumber: string;
  course: string;
  subject: string;
  date: string;
}

interface AssignmentDocument {
  id: string;
  title: string;
  sourceFileName: string;
  blocks: DocumentBlock[];
  metadata: AssignmentMetadata;
}

interface RenderSettings {
  fontFamily: string;
  fontSizePt: number;
  lineHeight: number;
  inkColor: "blue" | "black";
  paperType: "ruled" | "plain";
  marginMm: number;
  variation: number; // bounded 0..1
  showPageNumbers: boolean;
  showStudentHeader: boolean;
}
```

Validate render settings server-side. Do not trust dimensions, HTML, font names, or arbitrary CSS sent by the browser.

---

## 6. Handwriting rendering requirements

The visual result must be more than applying a cursive font to one giant string, but readability and layout correctness take priority over exaggerated realism.

### Fonts

- Include at least two distinct, legally redistributable handwriting fonts if their licenses allow it.
- Prefer fonts with broad Latin character coverage and inspect their licenses.
- Keep fonts in `public/fonts/` or another local static asset directory.
- Create a small font registry with a safe allowlist. Do not accept arbitrary font-family strings from a request.
- If the user enters Hindi/Devanagari, detect likely unsupported glyphs and display a clear warning/fallback rather than rendering missing-glyph boxes. Keep the architecture open to adding a licensed Devanagari handwriting font later.

### Controlled visual variation

Implement subtle, deterministic variation, using a seed derived from document ID + settings or an explicit seed:
- small, bounded word-spacing adjustments;
- subtle baseline shifts for text runs, within strict limits;
- optional selection among approved font variants for whole words or short runs if metrics remain predictable;
- very subtle ink/color texture only if it does not compromise legibility.

Do not randomly rotate every character. Avoid glyph overlaps, disconnected punctuation, and unpredictable word wrapping. If per-run variation makes pagination unstable, use a single handwriting font with carefully bounded spacing and focus on quality.

Variation level 0 must be completely stable and clean. Increasing variation should never cause text to overflow the page or overlap adjacent lines. Preview and exported PDF must use the same seed and styles.

### Paper

- A4 portrait is mandatory for v1.
- Ruled paper: draw horizontal lines with CSS/SVG or a local repeating background. Line spacing should be coordinated with text line height.
- Plain paper: no ruled lines.
- Use a margin/gutter guide if enabled by the design.
- Paper texture must be subtle and should not consume excessive ink when printed.
- Make page background and rules part of the printed output using print backgrounds.

---

## 7. Pagination and A4 correctness

This is a critical requirement. Do not simply set `height: 297mm` and allow content to clip.

- Page size must be exactly A4 portrait: 210 × 297 mm.
- Use `box-sizing: border-box`.
- Respect printable content margins.
- Keep headings with at least the first line of their following content when possible.
- Avoid splitting a short question heading from its answer.
- Preserve paragraph spacing and list indentation.
- Long paragraphs may flow across pages naturally.
- Never clip text silently.
- Recompute pagination when font, size, margins, or line spacing changes.
- Ensure the browser preview and exported PDF use identical layout styles and font assets.
- Include page count and page navigation/zoom.
- Ensure footer/page number never overlaps body text.
- Test at least one long document that spans 10+ pages.

### Recommended approach

Use actual HTML layout with fixed-size page containers and explicit pagination. A dedicated paginator can measure blocks using DOM/canvas font metrics, but must account for actual browser line wrapping. If using browser measurement, avoid using a different font/metric approximation for final placement.

A robust approach is to:
1. Render blocks into a measurement container with the exact font and width.
2. Measure each block's rendered height.
3. Place blocks into A4 page containers based on remaining height.
4. Split long paragraphs at line boundaries if necessary.
5. Re-render final pages and check for overflow.
6. Use the same renderer for preview and export.

If a simpler CSS paged layout proves more reliable in Chromium, prefer the simpler tested implementation over a home-grown fragile pagination engine.

---

## 8. PDF export

- Generate a real, multi-page, vector/text PDF via Playwright/Chromium.
- Set A4 page size explicitly.
- Print background colors/rules.
- Wait for all local fonts to load.
- Do not screenshot the page into a raster-only PDF.
- Keep text selectable where Chromium allows.
- Use a deterministic output filename and sanitize it.
- Revoke temporary object URLs after download.
- Show user-friendly export errors.
- Validate that exported file is non-empty and begins with a valid PDF signature.
- Verify exported PDF page dimensions are A4 using a PDF inspection tool/test where feasible.
- No remote network resources in the exported HTML.
- If Playwright's browser executable is missing, explain how to install it locally.

### PDF font embedding

Check the resulting PDF to confirm fonts are embedded/subset where expected. If a selected font is not embedded or doesn't render correctly, fix the font setup rather than silently accepting broken output.

---

## 9. Local privacy and security

- Uploaded file bytes stay local.
- No cloud services or external API calls.
- No analytics/telemetry.
- No server-side persistent file storage.
- Use local app endpoints only.
- Enforce file size limits (start with 20 MB; make configurable).
- Validate extension and MIME as a hint, not as the only validation.
- Catch parser exceptions and release resources.
- Sanitize filename for download.
- Avoid dangerously rendering arbitrary imported HTML.
- Escape text in React/rendering.
- Do not allow arbitrary CSS, scripts, or user-provided URLs in the PDF renderer.
- The export route should accept a typed document model, not raw HTML.
- Avoid logging assignment text or file contents.
- Document that this is a local personal app and should not be exposed to a public network without a separate security review.

---

## 10. Project structure

Use a structure like this, adapting to the actual repository:

```text
inkpaper/
├── public/
│   ├── fonts/
│   └── paper/
├── src/
│   ├── app/
│   │   ├── api/export/route.ts
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── components/
│   │   ├── upload/
│   │   ├── editor/
│   │   ├── studio/
│   │   ├── preview/
│   │   └── export/
│   ├── lib/
│   │   ├── parsers/
│   │   ├── document/
│   │   ├── layout/
│   │   ├── handwriting/
│   │   ├── pdf/
│   │   └── validation/
│   ├── types/
│   └── utils/
├── tests/
│   ├── parsers/
│   ├── layout/
│   └── export/
├── README.md
├── package.json
└── tsconfig.json
```

Keep pure logic separate from React. Don't create a folder/file for every tiny helper without a reason.

---

## 11. Tests and acceptance criteria

Do not call the app complete until these are verified.

### Import tests
- [ ] TXT import preserves paragraphs and Unicode text.
- [ ] DOCX import preserves basic headings, paragraphs, and lists.
- [ ] Text-based PDF import extracts readable text in a sensible order.
- [ ] Image-only/scanned PDF produces a helpful unsupported/OCR message.
- [ ] Corrupt/unsupported files fail gracefully.
- [ ] Oversized files are rejected.

### Editing and settings
- [ ] Editing text updates preview.
- [ ] Changing font/size/spacing/paper/ink updates preview.
- [ ] Reset settings works.
- [ ] Empty document blocks export.
- [ ] Font fallback/warnings are clear.

### Layout and export
- [ ] PDF is valid and non-empty.
- [ ] PDF pages are A4 portrait.
- [ ] 1-page document exports correctly.
- [ ] Long 10+ page document has no clipped text.
- [ ] Heading/question blocks are not stranded awkwardly when avoidable.
- [ ] Preview and exported output visually match.
- [ ] Fonts and ruled lines print correctly.
- [ ] Page numbers do not overlap content.
- [ ] Text remains selectable where possible.
- [ ] PDF generation works offline after local dependencies/browser are installed.

### Engineering
- [ ] TypeScript typecheck passes.
- [ ] Linter passes.
- [ ] Unit tests pass.
- [ ] Production build passes.
- [ ] No runtime external network requests are required.

Add tests for pagination edge cases, including a paragraph taller than one page, very long words, empty paragraphs, numbered questions, and a document ending exactly near the page boundary.

---

## 12. Development workflow for Claude Code

Work in this order:

### Phase 1 — inspect and scaffold
- Inspect existing repository and package manager.
- Preserve existing working setup if one exists.
- Create the app and install the minimal required dependencies.
- Write README setup/run instructions.

### Phase 2 — import pipeline
- Implement TXT, DOCX, and PDF parsers.
- Convert everything into the typed document model.
- Add parser tests and scanned-PDF detection.

### Phase 3 — rendering and pagination
- Create the A4 page renderer.
- Add local font registry and paper backgrounds.
- Implement measurement and safe page breaks.
- Verify a long sample assignment before polishing the UI.

### Phase 4 — studio UI
- Build the upload, editor, settings, and page preview panels.
- Make controls accessible and responsive.
- Add useful loading, empty, and error states.

### Phase 5 — PDF export
- Implement the local Playwright export route.
- Ensure local fonts are loaded before printing.
- Check A4 dimensions and compare output with preview.
- Handle missing Chromium cleanly.

### Phase 6 — quality pass
- Run typecheck, lint, tests, and production build.
- Fix issues instead of merely listing them.
- Test realistic sample documents.
- Inspect screenshots/PDF pages if tools are available.
- Update README with exact commands and known limitations.

At the end, report:
1. What was implemented.
2. Exact commands to install and run it locally.
3. Test/build results.
4. Any real limitations that remain.
5. How to add licensed handwriting fonts.

**Do not stop after the scaffold. Build the working end-to-end app.**

---

## 13. README must include

- Prerequisites (Node.js version and supported OS).
- Installation command.
- Browser/Playwright installation command if needed.
- Local run command.
- How to import each supported format.
- How to export the PDF.
- Where to place additional licensed fonts and how to register them.
- Current limitations (especially scanned PDFs, complex DOCX tables/images, and unsupported scripts).
- Privacy statement: no cloud upload; processing happens on the local machine.
- Troubleshooting for missing Chromium, font-loading failures, and PDF export errors.

---

## 14. Final priority order

When trade-offs arise, prioritize:

1. Correct, complete text with no silent loss.
2. Accurate A4 page dimensions and no clipped content.
3. Preview/export fidelity.
4. Readable, attractive handwriting styles.
5. Subtle visual variation.
6. UI polish and convenience.

Do not sacrifice content correctness for visual tricks. A clean, readable, well-paginated handwritten-style PDF is better than a more “realistic” one with overlapping text.

**Start by inspecting the repository, then implement the complete app.**
