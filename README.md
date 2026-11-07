# Lal Construction MEP Document Editor

A browser-based PDF editor for Lal Construction, built with React, Vite, PDF.js, and pdf-lib. PDFs are opened and edited locally in the browser; no upload API or backend is required. The editor adds annotation overlays to the PDF. Whiteout covers page content visually but does not securely remove underlying PDF data.

## Run locally

```bash
npm install
npm run dev
```

Vite prints the local preview URL when it is ready.

## Build for Vercel

This is a static Vite app and fits Vercel's free Hobby plan:

1. Import the repository into Vercel.
2. Keep the detected Vite settings (`npm run build`, output directory `dist`).
3. Deploy — no environment variables or server functions are required.

`vercel.json` includes the build and output settings. All PDF parsing, rendering, annotations, and page operations run client-side.

## Included editor features

- Open a PDF from disk or drag and drop it into the editor.
- Scroll through multipage documents with lazy page and thumbnail rendering, page navigation, zoom controls, and fit-to-page.
- Add text boxes and typed signatures; highlight or cover content; create sticky notes; and select, move, resize, or erase annotations.
- Draw with separate Pencil and Pen tools, each with adjustable thickness and color.
- Add rectangles, squares, circles, ovals, lines, arrows, triangles, diamonds, pentagons, hexagons, and stars with adjustable stroke weight and color.
- Format added text with font family, bold, italic, alignment, size, width, and color controls. Adjust highlight opacity and annotation colors.
- Add, duplicate, and remove pages.
- Use the mobile tool dock with text labels, an inline properties rail above the dock, page details when nothing is selected, and swipe-to-pan gestures on the page canvas.
- Undo and redo annotation changes; download a new PDF with edits included.
- A three-page sample document is generated locally on first load so the editor is ready to explore.
