<p align="center"><img src="public/logo.png" width="96" height="96" alt="InkPaper logo"></p>

# InkPaper

InkPaper turns your own typed or solved assignment into handwritten-style A4 pages and exports them as a real, printable PDF.

Type or paste on the ruled "practical page" on the left. The right side writes every line out by hand as you type. Questions are written on their own line, and answers start on the next line, in the ink colours you choose.

Everything happens **in your browser**. Your text and files are never uploaded, and there are no accounts, analytics or tracking. InkPaper is open source under the [MIT License](LICENSE).

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fanuraggoutam%2FAssignment)

---

## Two ways to run it

| | Hosted (e.g. Vercel) | Local (`npm run dev` / `npm start`) |
| --- | --- | --- |
| Setup | One click: deploy the repo | Node.js + `npm install` |
| PDF export | Browser print dialog, choose **Save as PDF** | Direct `.pdf` download via a local Chromium (falls back to the print dialog if Chromium isn't installed) |
| Where text is processed | In the visitor's browser only | In your browser and on your own machine |
| Offline | After the first visit, while the tab is open | Yes |

### Deploy to Vercel
1. Fork this repository, or use the **Deploy with Vercel** button above.
2. Import it in Vercel. The defaults are correct: framework **Next.js**, build command `next build`, no environment variables needed.
3. Deploy. On Vercel the server-side Chromium export is switched off automatically (it detects `VERCEL`), and **Export PDF** opens the browser's print dialog instead. The PDF still has selectable text and embedded handwriting fonts.

Any other Node host works too. Set `INKPAPER_DISABLE_SERVER_EXPORT=1` there unless the host has Chromium installed for Playwright.

### Run locally

Requirements:
- **Node.js 20.9 or newer** (tested with Node 22) and npm
- **Windows 10/11**, macOS or Linux
- About 300 MB of disk space for dependencies plus the local Chromium used for PDF export

```bash
npm install
npx playwright install chromium   # optional: enables direct .pdf downloads
npm run dev
```

Then open **http://127.0.0.1:3000** in Chrome or Edge. For a faster, optimised version run `npm run build` and then `npm start` (same address). Once installed, the local app works fully offline.

### Configuration (optional)

| Variable | Effect |
| --- | --- |
| `NEXT_PUBLIC_INKPAPER_EXPORT=browser` / `server` | Force the export method. The default is server on localhost and browser everywhere else. |
| `INKPAPER_DISABLE_SERVER_EXPORT=1` | Turn off the `/api/export` Chromium route. It is turned off automatically on Vercel. |
| `NEXT_PUBLIC_INKPAPER_MAX_UPLOAD_MB` | Import size limit. The default is 20. |

---

## Using it

### Write or paste
- Type directly on the ruled page, or paste text with Ctrl+V. The handwritten preview updates as you type, and the line you are editing is highlighted.
- **Questions:** lines that start with `Q1.`, `Q.1`, `Q 1)`, `Ques 1`, `Question 1:` or `Q:` are written as questions. They get a blank line before them, use the question ink, and are never left alone at the bottom of a page. Plain numbered lines such as `1.` or `2)` also count as questions; you can turn this off under **Style → Questions**.
- **Question numbers in the margin:** a short question number such as `Q1.`, `Q1 a).` or `Q3 (b)` is written in the left margin, outside the red line, both in the editor and on the handwritten pages. Long labels that don't fit stay at the start of the line. You can turn this off under **Style → Questions**.
- **Your own margin labels:** click the left margin next to any line, type anything (`Q1`, `Ans`, `Sol`, `Note`, `Ex 2`…, up to 10 characters) and press Enter. The label appears in the margin in the editor and on the handwritten page. It replaces that line's automatic Q/Ans label; clear the box to remove it. A label containing a number (e.g. `Q3`, `Ex 2`) marks the line as a question. Labels are stored in the text as `label» text`; the `»` is hidden in the editor and never printed. Esc cancels.
- **Answers:** any line after a question. **"Ans."** is written in the left margin on the first line of every answer, in the editor and on the pages. If you type `Ans:` / `Answer:` yourself, that label moves into the margin instead, so it isn't written twice. Turn this off with **Style → Questions → Write "Ans." in the margin**.
- **Headings:** start the line with `# ` (or `## ` / `### `). A level-1 heading is centred and underlined.
- **Bullets:** start the line with `- `, `* ` or `•`. Indent with spaces to nest them.
- **Sub-parts:** `(a)`, `a)`, `(ii)` and `(3)` get a hanging indent.
- Blank lines are kept as empty ruled lines.
- The **Question / Heading / Bullet** buttons add or remove these markers on the current line. **Question** uses the next free number, one more than the highest question already on the page.

### Keep your work
Tick **Keep my work in this browser** under the editor to keep your text, title and student details between visits. They are saved in this browser shortly after each change and restored when you open InkPaper again. Untick it to delete the saved copy. It is off by default. While it is off, InkPaper warns you before you close a tab that has unsaved text.

**New page** clears the text and title for the next assignment but keeps your name, roll number, course and subject.

### Import a file
Click **Import file**, or drag a file anywhere onto the window.

| Format | What happens |
| --- | --- |
| **TXT** | Read as UTF-8; Windows-1252 is used as a fallback. Line breaks and blank lines are kept. |
| **DOCX** | Headings, paragraphs and bulleted/numbered lists are kept. Tables are flattened into plain-text rows (cells separated by a vertical bar) and images are skipped, and a notice tells you when this happens. |
| **PDF** | Text-based PDFs only. Wrapped lines are re-joined into paragraphs, and question/list starts and large gaps begin new lines. Check the result for multi-column layouts. |

The size limit is 20 MB. You can change it with `NEXT_PUBLIC_INKPAPER_MAX_UPLOAD_MB` in a `.env.local` file, then rebuild or restart. **Reset to imported text** restores the original import after you have edited it; it asks before discarding your edits.

### Style
The **Style** panel controls:

- **Handwriting:** six styles.
- **Realism:** from "perfectly neat" (0) to "very loose".
- **Rewrite with a fresh hand:** gives a new variation seed.
- **Ink:** blue or black for answers, plus a separate ink for questions and headings (same, black, blue or red).
- **Layout:** writing size, line spacing and margins.
- **Paper:**
  - **Practical file** (default): modelled on a lab-record sheet, with a double-line TOPIC / DATE box, a double rule under it, a double margin line and thin grey lines across the full width. Every page has exactly **30 writing lines** by default (adjustable from 20 to 40 with *Lines per page*), so the line spacing is set by the paper, not the font size. The topic and date are handwritten into the box on page 1. A topic too long for the box is written as a heading on the page instead.
  - **Ruled:** a blue-lined notebook with a red margin line.
  - **Plain.**
  - Page numbers are optional on all three.
- **Assignment** (top of the panel): the title or topic, and the date (**Today** fills it in as DD/MM/YYYY). On practical-file paper they are written in the TOPIC and DATE boxes. Turn on **Student details on page 1** to add your name, roll number, course and subject; they are off by default.

The handwriting "variation" is deterministic. The same text, settings and seed always give exactly the same pages, both in the preview and in the PDF. Variation never changes the text and never pushes text outside the writing area.

### Export
Click **Export PDF**, or press **Ctrl+P** (Cmd+P on a Mac). The file is named after the title, for example `physics-practical-3-handwritten.pdf`, or `assignment-handwritten.pdf` if there is no title.

- **Hosted site (e.g. Vercel):** the browser's print dialog opens with your handwritten pages. Choose **Save as PDF**, paper size **A4**, margins **None** (or Default) and scale **100%**. Chrome and Edge give the closest match to the preview.
- **Running locally with Chromium installed:** the PDF downloads directly. It is printed by a local headless Chromium using the same renderer as the preview.

Both ways give an A4 portrait PDF with selectable, searchable text and embedded handwriting fonts. It is not a screenshot.

---

## Privacy

- Files are read **in your browser** and kept in memory. They are never uploaded.
- **Hosted:** the web server only delivers the app. Your text, files and PDFs never leave your browser, because export uses your browser's own print engine.
- **Local:** when you export, the text is sent only to the InkPaper server on your own machine (`127.0.0.1`). That server prints it with a local Chromium and immediately returns the PDF. Nothing is stored or logged.
- Your style settings are remembered in your browser's localStorage. Your text, title and student details are stored there only if you tick **Keep my work in this browser**, and they never leave the browser.
- The app makes no external network requests: no analytics, no CDNs, no remote fonts.
- The local Chromium export API (`/api/export`) only accepts requests addressed to localhost, and it is disabled on hosted deployments.

---

## Fonts and licences

All fonts are stored locally in `public/fonts/`, together with their licence files. They are registered in [src/lib/handwriting/fonts.ts](src/lib/handwriting/fonts.ts).

| Style | Font | Licence |
| --- | --- | --- |
| Caveat (default) | Caveat | SIL Open Font License 1.1 |
| Nanum Pen | Nanum Pen Script | SIL Open Font License 1.1 |
| Kalam | Kalam (Latin + Devanagari) | SIL Open Font License 1.1 |
| Indie Flower | Indie Flower | SIL Open Font License 1.1 |
| Patrick Hand | Patrick Hand | SIL Open Font License 1.1 |
| Homemade Apple | Homemade Apple | Apache License 2.0 |

All of these licences allow redistribution and embedding in PDFs. The font files were copied from the `@fontsource/*` npm packages with `node scripts/setup-fonts.mjs`. These are generic handwriting styles and are not modelled on any real person's handwriting.

### Adding your own licensed handwriting font
1. Check that the licence allows redistribution and PDF embedding. OFL and Apache 2.0 fonts are fine.
2. Put the `.woff2` file, and its licence as `<name>.LICENSE.txt`, in `public/fonts/`.
3. Add an entry to `FONTS` in `src/lib/handwriting/fonts.ts` with:
   - a unique `id`
   - a `family` name (prefix it with `InkPaper ` so it never clashes with system fonts)
   - the file name and its `unicodeRange`
   - `sizeScale`: about `0.47 / (x-height in em)`, so that its size matches the other styles
4. Restart the app. Only fonts in this registry can be chosen; the export API rejects anything else.

---

## Limitations

- **Scanned or image-only PDFs are not supported.** There is no OCR. InkPaper detects these files and says so; copy the text in manually instead.
- **PDF import** works best with single-column documents. Multi-column pages, headers/footers and page numbers from the original PDF may end up in the text, so review and edit before exporting.
- **DOCX:** tables are flattened to text rows; images, equations, footnotes, text boxes and text colours are not kept.
- **Unsupported characters:** characters outside Latin/Latin-Extended, such as Greek letters (π, Σ), many math symbols, arrows in some styles and emoji, are not in the handwriting fonts. They print in a plain system font, and the app lists them under the editor. Devanagari (Hindi) is written with the Kalam handwriting fallback; check the result.
- Multiple spaces inside a line become a single handwritten word gap. Leading indentation is kept.
- A4 portrait only. The preview and the browser print export are designed for Chromium-based browsers (Chrome/Edge). Firefox and Safari work, but may wrap a word differently or ignore some print settings. The local server export always uses Chromium.
- The hosted export goes through the print dialog, so it can't produce a file without that one extra click; that is a browser security rule.

---

## Troubleshooting

**Running locally, Export opens the print dialog instead of downloading**: the local Chromium isn't installed. Run `npx playwright install chromium` in the project folder, then restart `npm run dev`. Behind a proxy, set `HTTPS_PROXY` for that one install command. The print dialog works fine meanwhile.

**The printed PDF has a date/URL header, white margins or the wrong size**: in the print dialog set *Margins* to **None**, *Paper size* to **A4**, *Scale* to **100%**, and untick *Headers and footers*.

**"Could not reach the local InkPaper server"**: the terminal running `npm run dev` / `npm start` was closed. Start it again.

**Export takes long the first time**: in dev mode, Next.js compiles the print page on the first export, which can take 10–20 s. Later exports take 1–3 s. `npm run build && npm start` is faster.

**Font failed to load / boxes or plain text in the preview**: make sure the `.woff2` files exist in `public/fonts/`. If they are missing, run `npm install` then `node scripts/setup-fonts.mjs`.

**Port 3000 is in use**: run `npx next dev -H 127.0.0.1 -p 3001` (or change the port in `package.json`).

**PDF prints at the wrong size**: in the printer dialog, choose *Actual size* / *100%*, not "Fit to page".

---

## Development

```bash
npm run typecheck       # TypeScript (strict)
npm run lint            # ESLint (next/core-web-vitals + typescript)
npm test                # Vitest unit tests: parsers, layout/pagination, validation
npm run build           # production build
npm run verify:export   # end-to-end PDF check against a running server (npm run dev / npm start)
```

`verify:export` exports a 1-page document, a 10+ page document and a plain-paper Kalam document with Devanagari text into `test-output/`. It then checks the `%PDF-` signature, that every page is A4 portrait (595.28 × 841.89 pt), the page counts, selectable text, a non-blank last page and embedded handwriting fonts.

### How it works
- `src/lib/document/parseText.ts`: editor text → typed blocks (question / heading / paragraph / list).
- `src/lib/storage/local.ts`: everything kept in localStorage (settings, the opt-in draft). `src/components/studio/hooks.ts` wires it into the studio.
- `src/lib/pdf/downloadPdf.ts`: the browser side of export (request, validate `%PDF-`, download).
- `src/lib/layout/`: a pure layout engine. Words are measured with the real font on a canvas, wrapped to the writing width, and placed on ruled-line baselines. Pagination keeps headings and questions with their first answer line. Variation is seeded and bounded.
- `src/components/preview/PageSvg.tsx`: one SVG per A4 page. It is used both by the preview and by `/print`.
- `src/app/api/export/route.ts` + `src/lib/pdf/renderPdf.ts`: validate the typed payload with Zod, open `/print` in headless Chromium (only local requests are allowed), wait for the fonts, and run `page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true })`.
