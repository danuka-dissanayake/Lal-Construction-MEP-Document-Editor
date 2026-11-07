# Lal Construction MEP Document Editor

A single-page, browser-based PDF editor for Lal Construction, built with React, Vite, PDF.js, and pdf-lib. Files are opened and edited locally in the browser; there is no upload API or backend required. Existing PDF text is preserved as-is: edits are added as PDF annotations, and the whiteout tool masks content visually rather than rewriting the source text.

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
- Render and navigate pages with thumbnails, zoom controls, and fit-to-page.
- Add text and typed signatures, highlight, draw, add rectangles and sticky notes, cover existing content with whiteout, then move or erase annotations.
- Change annotation colors, text size, highlight opacity, and stroke weight.
- Add, duplicate, and remove pages.
- Undo and redo annotation changes; download a new PDF with edits included.
- A three-page sample document is generated locally on first load so the editor is ready to explore.
