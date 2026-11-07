import * as pdfjsLib from 'pdfjs-dist';

/** Extract selectable text runs and their page-relative bounds for visual editing. */
export async function extractPageTextItems(page) {
  const viewport = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();
  const styles = content.styles || {};

  return content.items.flatMap((item, index) => {
    if (typeof item.str !== 'string' || !item.str.trim() || !item.transform) return [];
    const transform = pdfjsLib.Util.transform(viewport.transform, item.transform);
    const fontHeight = Math.hypot(transform[2], transform[3]);
    if (!Number.isFinite(fontHeight) || fontHeight < 1) return [];

    const style = styles[item.fontName] || {};
    const rawFontFamily = String(style.fontFamily || item.fontName || '');
    const fontFamily = /mono|courier/i.test(rawFontFamily) ? 'Courier New' : /serif|times|roman/i.test(rawFontFamily) ? 'Times New Roman' : 'Arial';
    const ascentRatio = typeof style.ascent === 'number'
      ? style.ascent
      : typeof style.descent === 'number'
        ? 1 + style.descent
        : 0.8;
    const left = transform[4];
    const top = transform[5] - fontHeight * ascentRatio;
    const textWidth = Math.max(Number(item.width) || 0, fontHeight * 0.35);
    const width = Math.min(textWidth, Math.max(1, viewport.width - left));
    const height = fontHeight * 1.3;

    return [{
      index,
      text: item.str,
      x: left / viewport.width,
      y: top / viewport.height,
      w: width / viewport.width,
      h: height / viewport.height,
      size: fontHeight,
      angle: Math.atan2(transform[1], transform[0]) * (180 / Math.PI),
      fontFamily,
      bold: /bold|heavy|black/i.test(rawFontFamily),
      italic: /italic|oblique/i.test(rawFontFamily),
    }];
  });
}
