# Lal Construction MEP Document Editor

A single-page, browser-based PDF editor for Lal Construction, built with React, Vite, PDF.js, and pdf-lib. Files are opened and edited locally in the browser; there is no upload API or backend required. Selectable PDF text runs can be visually replaced with a white patch and new text. The original text remains underneath the patch, so this is not secure redaction; scanned PDFs need OCR before their text can be edited.

## Run locally


Vite prints the local preview URL when it is ready.

## Build for Vercel

This is a static Vite app and fits Vercel's free Hobby plan:

1. Import the repository into Vercel.
2. Keep the detected Vite settings (`npm run build`, output directory `dist`).
3. Deploy — no environment variables or server functions are required.

`vercel.json` includes the build and output settings. All PDF parsing, rendering, annotations, and page operations run client-side.

## Included editor features

- Open a PDF from disk or drag and drop it into the editor.
- Scroll vertically through the full document, with lazy page and thumbnail rendering, page navigation, zoom controls, and fit-to-page.
- Select and visually replace extractable text runs in uploaded PDFs (clicking only selects; original layout stays unchanged until you type), with adjustable text-box width; add text and typed signatures, highlight, draw, add rectangles and sticky notes, cover content with whiteout, then move or erase annotations.
- Format added and replacement text with font family, bold, italic, and alignment controls; change annotation colors, text size, highlight opacity, and stroke weight.
- Add, duplicate, and remove pages.
- Use a mobile tool dock with text labels, swipe-to-pan gestures on the page canvas, and a compact page/selection details bar.
- Undo and redo annotation changes; download a new PDF with edits included.
- A three-page sample document is generated locally on first load so the editor is ready to explore.
