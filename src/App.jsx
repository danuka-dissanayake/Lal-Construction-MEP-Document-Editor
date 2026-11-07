import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUpRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Circle,
  Diamond,
  Download,
  Eraser,
  FilePlus2,
  FileText,
  Highlighter,
  Info,
  LoaderCircle,
  Hexagon,
  LockKeyhole,
  MessageSquareText,
  Minus,
  MousePointer2,
  Pentagon,
  PenTool,
  Pencil,
  Plus,
  Redo2,
  ShieldCheck,
  Square,
  Star,
  Trash2,
  Triangle,
  Type,
  Undo2,
  Upload,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const COLORS = ['#252522', '#7666D8', '#F0795D', '#E6B84A', '#6DAA8B', '#5E9BC8', '#B779A9', '#FFFFFF'];
const DEFAULT_COLOR = '#7666D8';

const SHAPE_TOOL_IDS = ['shape', 'square', 'circle', 'oval', 'line', 'arrow', 'triangle', 'diamond', 'pentagon', 'hexagon', 'star'];
const FREEHAND_TOOL_IDS = ['draw', 'pen'];
const SHAPE_LABELS = {
  shape: 'Rectangle',
  square: 'Square',
  circle: 'Circle',
  oval: 'Oval',
  line: 'Line',
  arrow: 'Arrow',
  triangle: 'Triangle',
  diamond: 'Diamond',
  pentagon: 'Pentagon',
  hexagon: 'Hexagon',
  star: 'Star',
};

const TOOL_OPTIONS = [
  { id: 'select', label: 'Select', hint: 'Move things around', icon: MousePointer2 },
  { id: 'text', label: 'Add text', hint: 'Place a new text box', icon: Type },
  { id: 'highlight', label: 'Highlight', hint: 'Drag over a passage', icon: Highlighter },
  { id: 'whiteout', label: 'Whiteout', hint: 'Cover existing content', icon: Eraser },
  { id: 'draw', label: 'Pencil', hint: 'Sketch with a pencil', icon: Pencil },
  { id: 'pen', label: 'Pen', hint: 'Draw with a smooth pen', icon: PenTool },
  { id: 'shape', label: 'Rectangle', hint: 'Draw a rectangle', icon: Square },
  { id: 'square', label: 'Square', hint: 'Draw a square', icon: Square },
  { id: 'circle', label: 'Circle', hint: 'Draw a circle', icon: Circle },
  { id: 'oval', label: 'Oval', hint: 'Draw an oval', icon: Circle },
  { id: 'line', label: 'Line', hint: 'Draw a straight line', icon: Minus },
  { id: 'arrow', label: 'Arrow', hint: 'Draw an arrow', icon: ArrowUpRight },
  { id: 'triangle', label: 'Triangle', hint: 'Draw a triangle', icon: Triangle },
  { id: 'diamond', label: 'Diamond', hint: 'Draw a diamond', icon: Diamond },
  { id: 'pentagon', label: 'Pentagon', hint: 'Draw a pentagon', icon: Pentagon },
  { id: 'hexagon', label: 'Hexagon', hint: 'Draw a hexagon', icon: Hexagon },
  { id: 'star', label: 'Star', hint: 'Draw a star', icon: Star },
  { id: 'signature', label: 'Signature', hint: 'Add a written sign-off', icon: PenTool },
  { id: 'note', label: 'Sticky note', hint: 'Leave yourself a note', icon: MessageSquareText },
  { id: 'eraser', label: 'Eraser', hint: 'Remove an annotation', icon: Trash2 },
];

const TOOL_CURSORS = {
  select: 'default',
  text: 'text',
  highlight: 'crosshair',
  whiteout: 'crosshair',
  ...Object.fromEntries([...SHAPE_TOOL_IDS, ...FREEHAND_TOOL_IDS].map((id) => [id, 'crosshair'])),
  signature: 'copy',
  note: 'copy',
  eraser: "url('data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%3E%3Cpath%20d%3D%22m7%2021%2010.5-10.5a2.1%202.1%200%200%200-3-3L4%2018l3%203Z%22%20fill%3D%22%23fff%22%20stroke%3D%22%237667d8%22%20stroke-width%3D%221.8%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3Cpath%20d%3D%22m5%2017%204%204M3%2021h14%22%20fill%3D%22none%22%20stroke%3D%22%237667d8%22%20stroke-width%3D%221.8%22%2F%3E%3C%2Fsvg%3E') 4 18, crosshair",
};

function colorToRgb(hex) {
  const clean = hex.replace('#', '');
  const value = parseInt(clean, 16);
  return rgb(((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255);
}

function withAlpha(hex, alpha) {
  const clean = hex.replace('#', '');
  const value = parseInt(clean, 16);
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
}

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function polygonVertices(shapeType, x, y, width, height) {
  const sides = { triangle: 3, diamond: 4, pentagon: 5, hexagon: 6, star: 5 }[shapeType];
  if (!sides) return [];
  const isStar = shapeType === 'star';
  const count = isStar ? sides * 2 : sides;
  const centerX = x + width / 2;
  const centerY = y + height / 2;
  return Array.from({ length: count }, (_, index) => {
    const radiusScale = isStar && index % 2 ? 0.44 : 1;
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / count;
    return {
      x: centerX + Math.cos(angle) * (width / 2) * radiusScale,
      y: centerY + Math.sin(angle) * (height / 2) * radiusScale,
    };
  });
}

function ShapeSvg({ shapeType, x, y, w, h, points = [], color, strokeWidth = 2.5, zoom, pageWidth, pageHeight, annotationId, selected = false, interactive = false, draft = false }) {
  const left = x * 1000;
  const top = y * 1000;
  const width = w * 1000;
  const height = h * 1000;
  const start = points[0] || { x, y };
  const end = points[1] || { x: x + w, y: y + h };
  const markerId = `arrowhead-${annotationId || 'draft'}`;
  const geometryStyle = { pointerEvents: interactive ? (shapeType === 'line' || shapeType === 'arrow' ? 'stroke' : 'all') : 'none', touchAction: 'none' };
  const geometryProps = {
    fill: 'none',
    stroke: color,
    strokeWidth: strokeWidth * zoom / 100,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    vectorEffect: 'non-scaling-stroke',
    style: geometryStyle,
  };
  let geometry;

  if (shapeType === 'line' || shapeType === 'arrow') {
    geometry = <line {...geometryProps} x1={start.x * 1000} y1={start.y * 1000} x2={end.x * 1000} y2={end.y * 1000} markerEnd={shapeType === 'arrow' ? `url(#${markerId})` : undefined} />;
  } else if (shapeType === 'circle' || shapeType === 'square') {
    const cssSize = Math.min(width * (pageWidth || 1) / 1000, height * (pageHeight || 1) / 1000);
    const radiusX = (cssSize / (pageWidth || 1)) * 500;
    const radiusY = (cssSize / (pageHeight || 1)) * 500;
    const centerX = left + width / 2;
    const centerY = top + height / 2;
    geometry = shapeType === 'circle'
      ? <ellipse {...geometryProps} cx={centerX} cy={centerY} rx={radiusX} ry={radiusY} />
      : <rect {...geometryProps} x={centerX - radiusX} y={centerY - radiusY} width={radiusX * 2} height={radiusY * 2} />;
  } else if (shapeType === 'oval') {
    geometry = <ellipse {...geometryProps} cx={left + width / 2} cy={top + height / 2} rx={width / 2} ry={height / 2} />;
  } else if (shapeType === 'triangle' || shapeType === 'diamond' || shapeType === 'pentagon' || shapeType === 'hexagon' || shapeType === 'star') {
    const vertices = polygonVertices(shapeType, x, y, w, h).map((point) => `${point.x * 1000},${point.y * 1000}`).join(' ');
    geometry = <polygon {...geometryProps} points={vertices} />;
  } else {
    geometry = <rect {...geometryProps} x={left} y={top} width={width} height={height} />;
  }

  return (
    <svg
      className={draft ? 'drawing-draft shape-draft' : 'annotation-shape-svg'}
      data-annotation-id={annotationId}
      viewBox="0 0 1000 1000"
      preserveAspectRatio="none"
      style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', overflow: 'visible', pointerEvents: 'none' }}
    >
      {shapeType === 'arrow' && (
        <defs>
          <marker id={markerId} markerWidth="5" markerHeight="5" refX="4.5" refY="2.5" orient="auto" markerUnits="strokeWidth">
            <path d="M0,0 L5,2.5 L0,5 z" fill={color} />
          </marker>
        </defs>
      )}
      {geometry}
      {selected && <rect className="draw-selection" x={left} y={top} width={width} height={height} style={{ pointerEvents: 'none' }} />}
    </svg>
  );
}

function makeId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `note-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function drawWrappedText(page, text, options) {
  const { font, size, color, x, y, maxWidth, lineHeight, opacity, align = 'left' } = options;
  const normalized = String(text || '').split('\n').flatMap((line) => {
    const words = line.split(/\s+/).filter(Boolean);
    if (!words.length) return [''];
    const lines = [];
    let current = '';
    words.forEach((word) => {
      const trial = current ? `${current} ${word}` : word;
      if (current && font.widthOfTextAtSize(trial, size) > maxWidth) {
        lines.push(current);
        current = word;
      } else {
        current = trial;
      }
    });
    lines.push(current);
    return lines;
  });
  normalized.forEach((line, index) => {
    const lineWidth = font.widthOfTextAtSize(line, size);
    const lineX = align === 'center' ? x + Math.max(0, (maxWidth - lineWidth) / 2) : align === 'right' ? x + Math.max(0, maxWidth - lineWidth) : x;
    page.drawText(line, {
      x: lineX,
      y: y - index * lineHeight,
      font,
      size,
      color,
      opacity,
    });
  });
}

async function createStarterPdf() {
  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const serif = await document.embedFont(StandardFonts.TimesRoman);
  const serifBold = await document.embedFont(StandardFonts.TimesRomanBold);
  const ink = colorToRgb('#282923');
  const muted = colorToRgb('#77766F');
  const coral = colorToRgb('#E67C61');
  const cream = colorToRgb('#F7F5EF');
  const green = colorToRgb('#758D78');
  const lavender = colorToRgb('#EDEAF8');

  // Cover page — warm editorial stationery that doubles as a useful editing canvas.
  const cover = document.addPage([612, 792]);
  cover.drawRectangle({ x: 0, y: 0, width: 612, height: 792, color: cream });
  cover.drawRectangle({ x: 0, y: 0, width: 12, height: 792, color: coral });
  cover.drawText('FIELDNOTES', { x: 58, y: 722, size: 11, font: bold, color: ink, characterSpacing: 1.4 });
  cover.drawText('A SMALL GUIDE TO LIVING WELL', { x: 58, y: 704, size: 8, font: regular, color: muted, characterSpacing: 0.8 });
  cover.drawText('ISSUE 01   /   2025', { x: 457, y: 722, size: 8, font: bold, color: muted });
  cover.drawLine({ start: { x: 58, y: 688 }, end: { x: 554, y: 688 }, thickness: 0.8, color: colorToRgb('#D9D7D0') });

  cover.drawCircle({ x: 472, y: 534, size: 92, color: colorToRgb('#E8B7A7') });
  cover.drawCircle({ x: 493, y: 553, size: 57, color: colorToRgb('#D9D9C7') });
  cover.drawCircle({ x: 453, y: 510, size: 27, color: colorToRgb('#D4C9E9') });
  cover.drawText('A slower', { x: 58, y: 559, size: 54, font: serifBold, color: ink });
  cover.drawText('kind of living.', { x: 58, y: 501, size: 47, font: serif, color: ink });
  cover.drawText('Thoughtful spaces, everyday rituals, and the beauty', { x: 60, y: 454, size: 12, font: regular, color: muted });
  cover.drawText('of making a little more room for what matters.', { x: 60, y: 437, size: 12, font: regular, color: muted });
  cover.drawText('A FIELD GUIDE FOR THE PRESENT MOMENT', { x: 60, y: 365, size: 8, font: bold, color: coral, characterSpacing: 1.15 });
  cover.drawRectangle({ x: 58, y: 183, width: 496, height: 142, color: colorToRgb('#EEECE4') });
  cover.drawText('IN THIS ISSUE', { x: 78, y: 296, size: 8, font: bold, color: muted, characterSpacing: 1.1 });
  cover.drawText('01', { x: 78, y: 260, size: 19, font: serif, color: coral });
  cover.drawText('Make room for light', { x: 112, y: 264, size: 12, font: bold, color: ink });
  cover.drawText('02', { x: 78, y: 231, size: 19, font: serif, color: coral });
  cover.drawText('Keep only what you love', { x: 112, y: 235, size: 12, font: bold, color: ink });
  cover.drawText('03', { x: 78, y: 202, size: 19, font: serif, color: coral });
  cover.drawText('A softer kind of everyday', { x: 112, y: 206, size: 12, font: bold, color: ink });
  cover.drawLine({ start: { x: 58, y: 65 }, end: { x: 554, y: 65 }, thickness: 0.8, color: colorToRgb('#D9D7D0') });
  cover.drawText('FIELDNOTES  /  A SLOW-LIVING JOURNAL', { x: 58, y: 45, size: 7, font: regular, color: muted, characterSpacing: 0.7 });
  cover.drawText('01', { x: 536, y: 45, size: 8, font: bold, color: ink });

  // Editorial page.
  const article = document.addPage([612, 792]);
  article.drawRectangle({ x: 0, y: 0, width: 612, height: 792, color: colorToRgb('#FFFFFF') });
  article.drawText('FIELDNOTES', { x: 58, y: 729, size: 9, font: bold, color: ink, characterSpacing: 1.2 });
  article.drawText('01  /  MAKE ROOM', { x: 438, y: 729, size: 8, font: regular, color: muted });
  article.drawLine({ start: { x: 58, y: 711 }, end: { x: 554, y: 711 }, thickness: 0.8, color: colorToRgb('#E2E0DA') });
  article.drawText('The beauty of', { x: 58, y: 633, size: 42, font: serifBold, color: ink });
  article.drawText('leaving space.', { x: 58, y: 588, size: 42, font: serif, color: ink });
  article.drawText('A home does not have to be finished to feel complete.', { x: 60, y: 542, size: 11, font: regular, color: muted });
  article.drawText('Sometimes the most generous thing we can do is let a', { x: 60, y: 522, size: 11, font: regular, color: muted });
  article.drawText('room breathe — and let the things we love stand out.', { x: 60, y: 502, size: 11, font: regular, color: muted });
  article.drawRectangle({ x: 58, y: 342, width: 496, height: 112, color: lavender });
  article.drawRectangle({ x: 58, y: 342, width: 4, height: 112, color: colorToRgb('#8C7DD7') });
  article.drawText('“', { x: 78, y: 397, size: 42, font: serif, color: colorToRgb('#8C7DD7') });
  article.drawText('A little less, chosen with care,', { x: 119, y: 403, size: 17, font: serif, color: ink });
  article.drawText('can make a lot more room for joy.', { x: 119, y: 379, size: 17, font: serif, color: ink });
  article.drawText('A NOTE TO KEEP CLOSE', { x: 120, y: 358, size: 7, font: bold, color: muted, characterSpacing: 1.0 });
  article.drawText('THREE SMALL STARTS', { x: 58, y: 291, size: 8, font: bold, color: coral, characterSpacing: 1.1 });
  article.drawLine({ start: { x: 58, y: 278 }, end: { x: 554, y: 278 }, thickness: 0.7, color: colorToRgb('#E2E0DA') });
  const columnX = [58, 229, 400];
  const labels = [
    ['01', 'LET LIGHT IN', 'Keep the window clear.\nNotice how the room\nchanges through the day.'],
    ['02', 'EDIT GENTLY', 'Give every object a\nreason to be here — and\nspace to be itself.'],
    ['03', 'MAKE IT YOURS', 'A well-loved thing is\nnever out of place.\nLet your life show.'],
  ];
  labels.forEach((item, index) => {
    const x = columnX[index];
    article.drawText(item[0], { x, y: 248, size: 17, font: serif, color: green });
    article.drawText(item[1], { x, y: 222, size: 8, font: bold, color: ink, characterSpacing: 0.7 });
    item[2].split('\n').forEach((line, lineIndex) => {
      article.drawText(line, { x, y: 198 - lineIndex * 16, size: 9, font: regular, color: muted });
    });
  });
  article.drawLine({ start: { x: 58, y: 65 }, end: { x: 554, y: 65 }, thickness: 0.8, color: colorToRgb('#E2E0DA') });
  article.drawText('A SMALL GUIDE TO LIVING WELL', { x: 58, y: 45, size: 7, font: regular, color: muted, characterSpacing: 0.7 });
  article.drawText('02', { x: 536, y: 45, size: 8, font: bold, color: ink });

  // Closing page.
  const closing = document.addPage([612, 792]);
  closing.drawRectangle({ x: 0, y: 0, width: 612, height: 792, color: colorToRgb('#46564C') });
  closing.drawCircle({ x: 516, y: 700, size: 76, color: colorToRgb('#728677') });
  closing.drawCircle({ x: 539, y: 678, size: 34, color: colorToRgb('#E6B84A') });
  closing.drawText('FIELDNOTES  /  A LAST THOUGHT', { x: 58, y: 718, size: 8, font: bold, color: colorToRgb('#E6E4DA'), characterSpacing: 1.0 });
  closing.drawLine({ start: { x: 58, y: 696 }, end: { x: 554, y: 696 }, thickness: 0.8, color: colorToRgb('#748176') });
  closing.drawText('The most', { x: 58, y: 549, size: 49, font: serif, color: colorToRgb('#F7F5EF') });
  closing.drawText('meaningful spaces', { x: 58, y: 496, size: 43, font: serifBold, color: colorToRgb('#F7F5EF') });
  closing.drawText('are not the ones', { x: 58, y: 444, size: 43, font: serif, color: colorToRgb('#F7F5EF') });
  closing.drawText('filled with things —', { x: 58, y: 392, size: 43, font: serif, color: colorToRgb('#F7F5EF') });
  closing.drawText('but with the things', { x: 58, y: 340, size: 43, font: serif, color: colorToRgb('#F7F5EF') });
  closing.drawText('you choose to keep.', { x: 58, y: 288, size: 43, font: serifBold, color: colorToRgb('#E9BD72') });
  closing.drawLine({ start: { x: 58, y: 209 }, end: { x: 107, y: 209 }, thickness: 2, color: coral });
  closing.drawText('A GENTLE REMINDER TO COME BACK TO YOURSELF.', { x: 58, y: 183, size: 8, font: bold, color: colorToRgb('#D2D7CE'), characterSpacing: 0.9 });
  closing.drawText('— FIELDNOTES, ISSUE 01', { x: 58, y: 146, size: 10, font: regular, color: colorToRgb('#D2D7CE') });
  closing.drawLine({ start: { x: 58, y: 65 }, end: { x: 554, y: 65 }, thickness: 0.8, color: colorToRgb('#748176') });
  closing.drawText('TAKE WHAT YOU NEED. LEAVE THE REST.', { x: 58, y: 45, size: 7, font: regular, color: colorToRgb('#D2D7CE'), characterSpacing: 0.7 });
  closing.drawText('03', { x: 536, y: 45, size: 8, font: bold, color: colorToRgb('#F7F5EF') });

  return document.save();
}

function PageThumbnail({ document, pageNumber, active, onClick }) {
  const buttonRef = useRef(null);
  const canvasRef = useRef(null);
  const [near, setNear] = useState(pageNumber <= 4);

  useEffect(() => {
    const node = buttonRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      setNear(true);
      return undefined;
    }
    const observer = new IntersectionObserver((entries) => {
      const entry = entries[0];
      if (entry) setNear(entry.isIntersecting);
    }, { root: node.closest('.sidebar-scroll'), rootMargin: '180px 0px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!document || (!near && !active) || !canvas) {
      if (!near && !active && canvas) {
        canvas.width = 0;
        canvas.height = 0;
      }
      return undefined;
    }
    let task;
    let cancelled = false;
    document.getPage(pageNumber).then((page) => {
      if (cancelled || !canvasRef.current) return;
      const baseViewport = page.getViewport({ scale: 1 });
      const scale = Math.min(92 / baseViewport.width, 116 / baseViewport.height);
      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d', { alpha: false });
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.round(viewport.width * ratio);
      canvas.height = Math.round(viewport.height * ratio);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      task = page.render({
        canvasContext: context,
        viewport,
        transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined,
      });
      return task.promise;
    }).catch((error) => {
      if (error?.name !== 'RenderingCancelledException') console.warn('Could not render page preview', error);
    });
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [document, pageNumber, near, active]);

  return (
    <button ref={buttonRef} className={`page-thumb ${active ? 'active' : ''}`} onClick={onClick} type="button" aria-label={`Go to page ${pageNumber}`}>
      <span className="thumb-paper"><canvas ref={canvasRef} /></span>
      <span className="thumb-meta"><span className="thumb-number">{String(pageNumber).padStart(2, '0')}</span><span className="thumb-name">Page {pageNumber}</span></span>
    </button>
  );
}

function PdfPage({
  pdfDocument,
  pageIndex,
  pageStageRef,
  zoom,
  active,
  annotations,
  tool,
  currentColor,
  selectedId,
  setSelectedId,
  addAnnotation,
  commitAnnotations,
  updateAnnotation,
  removeAnnotation,
  onPageSize,
}) {
  const recordRef = useRef(null);
  const canvasRef = useRef(null);
  const renderTaskRef = useRef(null);
  const [near, setNear] = useState(pageIndex === 0);
  const [pdfPage, setPdfPage] = useState(null);
  const [pageSize, setPageSize] = useState({ width: 612 * zoom / 100, height: 792 * zoom / 100 });

  useEffect(() => {
    const node = recordRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      setNear(true);
      return undefined;
    }
    const observer = new IntersectionObserver((entries) => {
      const entry = entries[0];
      if (entry) setNear(entry.isIntersecting);
    }, { root: pageStageRef.current || null, rootMargin: '850px 0px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [pageStageRef]);

  useEffect(() => {
    let cancelled = false;
    setPdfPage(null);
    if (!pdfDocument || !near) return () => { cancelled = true; };
    pdfDocument.getPage(pageIndex + 1).then((page) => {
      if (!cancelled) setPdfPage(page);
    }).catch((error) => {
      if (!cancelled) console.warn(`Could not load page ${pageIndex + 1}`, error);
    });
    return () => { cancelled = true; };
  }, [pdfDocument, pageIndex, near]);

  useEffect(() => {
    if (!pdfPage) return;
    const viewport = pdfPage.getViewport({ scale: zoom / 100 });
    const size = { width: viewport.width, height: viewport.height };
    setPageSize(size);
    onPageSize(pageIndex, size);
  }, [pdfPage, pageIndex, zoom, onPageSize]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    if (!pdfPage || !near) {
      if (!near) {
        canvas.width = 0;
        canvas.height = 0;
      }
      return undefined;
    }
    let cancelled = false;
    const viewport = pdfPage.getViewport({ scale: zoom / 100 });
    const ratio = window.devicePixelRatio || 1;
    const context = canvas.getContext('2d', { alpha: false });
    canvas.width = Math.max(1, Math.round(viewport.width * ratio));
    canvas.height = Math.max(1, Math.round(viewport.height * ratio));
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;
    const task = pdfPage.render({
      canvasContext: context,
      viewport,
      transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined,
    });
    renderTaskRef.current = task;
    task.promise.catch((error) => {
      if (!cancelled && error?.name !== 'RenderingCancelledException') console.warn(`Could not render page ${pageIndex + 1}`, error);
    });
    return () => {
      cancelled = true;
      task.cancel();
      if (renderTaskRef.current === task) renderTaskRef.current = null;
    };
  }, [pdfPage, pageIndex, zoom, near]);

  return (
    <div className={`document-page-record ${active ? 'active' : ''}`} data-page-index={pageIndex} ref={recordRef}>
      <div className="document-page-caption" style={{ width: pageSize.width }}>
        <span>PAGE {String(pageIndex + 1).padStart(2, '0')}</span>
        <span>{active ? 'CURRENT PAGE' : 'PDF PAGE'}</span>
      </div>
      <div className="pdf-page-shell" style={{ width: pageSize.width, height: pageSize.height }}>
        {near && pdfPage ? <canvas ref={canvasRef} className="pdf-canvas" /> : <div className="pdf-page-placeholder" />}
        {near && pdfPage && (
          <AnnotationLayer
            annotations={annotations}
            currentPage={pageIndex}
            pageSize={pageSize}
            zoom={zoom}
            tool={tool}
            currentColor={currentColor}
            selectedId={selectedId}
            setSelectedId={setSelectedId}
            addAnnotation={addAnnotation}
            commitAnnotations={commitAnnotations}
            updateAnnotation={updateAnnotation}
            removeAnnotation={removeAnnotation}
          />
        )}
      </div>
    </div>
  );
}

function Palette({ value, onChange, label = 'COLOR' }) {
  return (
    <div className="palette-section">
      <div className="inspector-label"><span>{label}</span><span className="color-code">{value.toUpperCase()}</span></div>
      <div className="color-palette" role="group" aria-label="Choose an annotation color">
        {COLORS.map((color) => (
          <button
            key={color}
            type="button"
            className={`color-swatch ${value.toLowerCase() === color.toLowerCase() ? 'chosen' : ''} ${color === '#FFFFFF' ? 'swatch-white' : ''}`}
            style={{ '--swatch-color': color }}
            onClick={() => onChange(color)}
            aria-label={`Use ${color} color`}
            title={color}
          >
            {value.toLowerCase() === color.toLowerCase() && <Check size={12} strokeWidth={2.5} />}
          </button>
        ))}
        <label className="custom-color" title="Choose a custom color">
          <span>+</span>
          <input type="color" value={value} onChange={(event) => onChange(event.target.value)} aria-label="Choose a custom color" />
        </label>
      </div>
    </div>
  );
}

function MobilePropertiesBar({ annotation, label, currentColor, onUpdate, onColorChange, onFinish, onDelete, onMore }) {
  const type = annotation.type;
  const hasText = ['text', 'signature', 'note'].includes(type);
  const hasFontFormatting = type === 'text';
  const hasSize = ['text', 'signature'].includes(type);
  const hasWidth = ['text', 'signature', 'note'].includes(type);
  const color = annotation.color || currentColor;
  const widthMax = Math.max(5, Math.floor((1 - annotation.x) * 100));
  const widthValue = Math.min(widthMax, Math.max(5, Math.round((annotation.w || 0.4) * 100)));
  const iconToolId = type === 'shape'
    ? annotation.shapeType === 'rectangle' ? 'shape' : annotation.shapeType || 'shape'
    : type;
  const PropertyIcon = TOOL_OPTIONS.find(({ id }) => id === iconToolId)?.icon || Type;

  return (
    <div className="mobile-properties-bar" role="region" aria-label={`${label} properties`}>
      <div className="mobile-properties-main">
        <div className="mobile-property-context">
          <span className="mobile-property-context-icon"><PropertyIcon size={15} /></span>
          <span className="mobile-property-context-copy"><strong>{label}</strong><small>Page {annotation.pageIndex + 1}</small></span>
        </div>
        {hasText && (
          <textarea
            className="mobile-property-text-input"
            rows={1}
            value={annotation.text || ''}
            onChange={(event) => onUpdate({ text: event.target.value })}
            onBlur={onFinish}
            aria-label={type === 'note' ? 'Note content' : type === 'signature' ? 'Signature text' : 'Text content'}
            placeholder="Type text…"
          />
        )}
        <button type="button" className="mobile-property-icon-button" onClick={onMore} aria-label="Open full properties" title="More properties"><Info size={16} /></button>
        {annotation.id && <button type="button" className="mobile-property-icon-button mobile-property-delete" onClick={() => onDelete(annotation.id)} aria-label="Delete selected item" title="Delete item"><Trash2 size={15} /></button>}
      </div>

      <div className="mobile-properties-controls">
        {hasFontFormatting && (
          <>
            <select
              className="mobile-property-font"
              value={annotation.fontFamily || 'Arial'}
              onChange={(event) => onUpdate({ fontFamily: event.target.value })}
              onBlur={onFinish}
              aria-label="Font family"
            >
              <option value="Arial">Arial</option>
              <option value="Times New Roman">Times</option>
              <option value="Courier New">Courier</option>
            </select>
            <div className="mobile-property-toggle-group" role="group" aria-label="Font style">
              <button type="button" className={annotation.bold ? 'active' : ''} onClick={() => { onUpdate({ bold: !annotation.bold }); onFinish(); }} aria-pressed={Boolean(annotation.bold)} aria-label="Bold" title="Bold"><b>B</b></button>
              <button type="button" className={annotation.italic ? 'active' : ''} onClick={() => { onUpdate({ italic: !annotation.italic }); onFinish(); }} aria-pressed={Boolean(annotation.italic)} aria-label="Italic" title="Italic"><i>I</i></button>
            </div>
            <div className="mobile-property-align-group" role="group" aria-label="Text alignment">
              {['left', 'center', 'right'].map((align) => (
                <button key={align} type="button" className={annotation.align === align || (!annotation.align && align === 'left') ? 'active' : ''} onClick={() => { onUpdate({ align }); onFinish(); }} aria-pressed={annotation.align === align || (!annotation.align && align === 'left')} aria-label={`Align ${align}`} title={`Align ${align}`}>
                  {align === 'left' ? 'L' : align === 'center' ? 'C' : 'R'}
                </button>
              ))}
            </div>
          </>
        )}

        {hasSize && (
          <label className="mobile-property-range">
            <span>Size <b>{annotation.size || 22} pt</b></span>
            <input type="range" min="6" max="72" step="1" value={annotation.size || 22} onChange={(event) => onUpdate({ size: Number(event.target.value) })} onBlur={onFinish} aria-label="Text size" />
          </label>
        )}

        {hasWidth && (
          <label className="mobile-property-range mobile-width-range">
            <span>Width <b>{Math.round((annotation.w || 0.4) * 100)}%</b></span>
            <input type="range" min="5" max={widthMax} step="1" value={widthValue} onChange={(event) => onUpdate({ w: Number(event.target.value) / 100 })} onBlur={onFinish} aria-label="Text box width" />
          </label>
        )}

        {type === 'highlight' && (
          <label className="mobile-property-range">
            <span>Opacity <b>{Math.round((annotation.opacity ?? 0.34) * 100)}%</b></span>
            <input type="range" min="10" max="80" step="5" value={Math.round((annotation.opacity ?? 0.34) * 100)} onChange={(event) => onUpdate({ opacity: Number(event.target.value) / 100 })} onBlur={onFinish} aria-label="Highlight opacity" />
          </label>
        )}

        {['shape', 'draw', 'pen'].includes(type) && (
          <label className="mobile-property-range">
            <span>{['draw', 'pen'].includes(type) ? 'Thickness' : 'Stroke'} <b>{annotation.strokeWidth || 2.5}px</b></span>
            <input type="range" min="1" max="8" step="0.5" value={annotation.strokeWidth || 2.5} onChange={(event) => onUpdate({ strokeWidth: Number(event.target.value) })} onBlur={onFinish} aria-label={['draw', 'pen'].includes(type) ? 'Drawing thickness' : 'Shape stroke width'} />
          </label>
        )}

        {type !== 'whiteout' && (
          <div className="mobile-property-colors" role="group" aria-label="Choose item color">
            {COLORS.map((swatch) => (
              <button key={swatch} type="button" className={`mobile-property-swatch ${swatch === '#FFFFFF' ? 'swatch-white' : ''} ${color.toLowerCase() === swatch.toLowerCase() ? 'chosen' : ''}`} style={{ '--swatch-color': swatch }} onClick={() => onColorChange(swatch)} aria-label={`Use ${swatch} color`} title={swatch}>
                {color.toLowerCase() === swatch.toLowerCase() && <Check size={11} />}
              </button>
            ))}
            <label className="mobile-property-custom-color" title="Choose a custom color">
              <span>+</span><input type="color" value={color} onChange={(event) => onColorChange(event.target.value)} aria-label="Choose custom color" />
            </label>
          </div>
        )}
      </div>
    </div>
  );
}

function AnnotationLayer({
  annotations,
  currentPage,
  pageSize,
  zoom,
  tool,
  currentColor,
  selectedId,
  setSelectedId,
  addAnnotation,
  commitAnnotations,
  updateAnnotation,
  removeAnnotation,
}) {
  const layerRef = useRef(null);
  const draftRef = useRef(null);
  const dragRef = useRef(null);
  const [draft, setDraft] = useState(null);

  const pointFromEvent = useCallback((event) => {
    const rect = layerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: clamp((event.clientX - rect.left) / rect.width),
      y: clamp((event.clientY - rect.top) / rect.height),
    };
  }, []);

  const handlePointerDown = (event) => {
    const point = pointFromEvent(event);
    const resizeTarget = event.target.closest?.('[data-resize-id]');
    const target = event.target.closest?.('[data-annotation-id]');
    const targetId = target?.dataset.annotationId;

    if (tool === 'select' && resizeTarget) {
      const id = resizeTarget.dataset.resizeId;
      const annotation = annotations.find((item) => item.id === id);
      if (!annotation) return;
      event.preventDefault();
      setSelectedId(id);
      layerRef.current?.setPointerCapture?.(event.pointerId);
      dragRef.current = {
        mode: 'resize',
        id,
        pointerId: event.pointerId,
        startX: point.x,
        originalX: annotation.x,
        originalW: annotation.w,
        moved: false,
        originalAnnotations: annotations,
      };
      return;
    }

    if (tool === 'eraser' && targetId) {
      event.preventDefault();
      removeAnnotation(targetId);
      return;
    }

    if (tool === 'select' && targetId) {
      const annotation = annotations.find((item) => item.id === targetId);
      if (!annotation) return;
      event.preventDefault();
      setSelectedId(targetId);
      layerRef.current?.setPointerCapture?.(event.pointerId);
      dragRef.current = {
        id: targetId,
        pointerId: event.pointerId,
        startX: point.x,
        startY: point.y,
        originalX: annotation.x,
        originalY: annotation.y,
        originalPoints: annotation.points,
        moved: false,
        originalAnnotations: annotations,
      };
      return;
    }

    if (tool === 'select') {
      setSelectedId(null);
      return;
    }

    if (tool === 'text' || tool === 'signature' || tool === 'note') {
      event.preventDefault();
      const annotation = {
        id: makeId(),
        type: tool,
        pageIndex: currentPage,
        x: point.x,
        y: point.y,
        w: tool === 'note' ? 0.28 : 0.42,
        h: tool === 'note' ? 0.16 : 0.09,
        text: tool === 'text' ? 'Type something here' : tool === 'signature' ? 'Your signature' : 'A little note to remember…',
        color: currentColor,
        size: tool === 'signature' ? 28 : 22,
        fontFamily: 'Arial',
        bold: false,
        italic: false,
        align: 'left',
        opacity: 0.34,
        strokeWidth: 2.5,
      };
      addAnnotation(annotation);
      setSelectedId(annotation.id);
      return;
    }

    if (['highlight', 'whiteout', ...SHAPE_TOOL_IDS, ...FREEHAND_TOOL_IDS].includes(tool)) {
      event.preventDefault();
      layerRef.current?.setPointerCapture?.(event.pointerId);
      const fresh = {
        type: tool,
        pointerId: event.pointerId,
        start: point,
        current: point,
        points: [point],
      };
      draftRef.current = fresh;
      setDraft(fresh);
    }
  };

  const handlePointerMove = (event) => {
    const point = pointFromEvent(event);
    const drag = dragRef.current;
    if (drag && drag.pointerId === event.pointerId) {
      const dx = point.x - drag.startX;
      const dy = drag.mode === 'resize' ? 0 : point.y - drag.startY;
      if (!drag.moved && Math.hypot(dx, dy) < 0.0015) return;
      drag.moved = true;
      if (drag.mode === 'resize') {
        const maxWidth = Math.max(0.05, 1 - drag.originalX);
        updateAnnotation(drag.id, { w: clamp(drag.originalW + dx, 0.05, maxWidth) });
      } else {
        const nextX = clamp(drag.originalX + dx, -0.2, 0.95);
        const nextY = clamp(drag.originalY + dy, -0.2, 0.95);
        const patch = { x: nextX, y: nextY };
        if (Array.isArray(drag.originalPoints)) {
          patch.points = drag.originalPoints.map((item) => ({
            x: item.x + nextX - drag.originalX,
            y: item.y + nextY - drag.originalY,
          }));
        }
        updateAnnotation(drag.id, patch);
      }
      return;
    }
    const activeDraft = draftRef.current;
    if (!activeDraft || activeDraft.pointerId !== event.pointerId) return;
    const next = {
      ...activeDraft,
      current: point,
      points: FREEHAND_TOOL_IDS.includes(activeDraft.type) ? [...activeDraft.points, point] : activeDraft.points,
    };
    draftRef.current = next;
    setDraft(next);
  };

  const handlePointerUp = (event) => {
    const drag = dragRef.current;
    if (drag && drag.pointerId === event.pointerId) {
      if (drag.moved) commitAnnotations(drag.originalAnnotations);
      dragRef.current = null;
      return;
    }
    const currentDraft = draftRef.current;
    if (!currentDraft || currentDraft.pointerId !== event.pointerId) return;
    const { start, current, type, points } = currentDraft;
    const left = Math.min(start.x, current.x);
    const top = Math.min(start.y, current.y);
    const width = Math.abs(current.x - start.x);
    const height = Math.abs(current.y - start.y);
    const isFreehand = FREEHAND_TOOL_IDS.includes(type);
    const isShape = SHAPE_TOOL_IDS.includes(type);
    if (isFreehand ? points.length > 1 : width > 0.003 || height > 0.003) {
      const annotation = {
        id: makeId(),
        type: isShape ? 'shape' : type,
        shapeType: isShape ? (type === 'shape' ? 'rectangle' : type) : undefined,
        pageIndex: currentPage,
        x: left,
        y: top,
        w: Math.max(width, 0.005),
        h: Math.max(height, type === 'highlight' ? 0.018 : 0.005),
        points: isFreehand ? points : isShape ? [start, current] : undefined,
        color: currentColor,
        size: 22,
        opacity: 0.34,
        strokeWidth: type === 'pen' ? 3.2 : type === 'draw' ? 2.2 : 2.5,
      };
      addAnnotation(annotation);
      setSelectedId(annotation.id);
    }
    draftRef.current = null;
    setDraft(null);
  };

  const pageAnnotations = annotations.filter((annotation) => annotation.pageIndex === currentPage);
  const draftPath = (points = []) => points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x * 1000} ${point.y * 1000}`).join(' ');
  const interactive = tool === 'select' || tool === 'eraser';

  return (
    <div
      ref={layerRef}
      className={`annotation-layer tool-cursor-${tool}`}
      style={{
        width: pageSize.width,
        height: pageSize.height,
        cursor: TOOL_CURSORS[tool] || 'default',
        touchAction: tool === 'select' ? 'pan-x pan-y' : 'none',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      role="presentation"
    >
      {pageAnnotations.map((annotation) => {
        const isSelected = annotation.id === selectedId;
        const shared = {
          'data-annotation-id': annotation.id,
          className: `annotation-item annotation-${annotation.type} ${isSelected ? 'is-selected' : ''}`,
          style: {
            left: `${annotation.x * 100}%`,
            top: `${annotation.y * 100}%`,
            pointerEvents: interactive ? 'auto' : 'none',
          },
        };
        if (FREEHAND_TOOL_IDS.includes(annotation.type)) {
          return (
            <svg
              key={annotation.id}
              data-annotation-id={annotation.id}
              className="annotation-draw-svg"
              viewBox="0 0 1000 1000"
              preserveAspectRatio="none"
              style={{ left: 0, top: 0, width: '100%', height: '100%', overflow: 'visible', pointerEvents: 'none' }}
            >
              <path d={draftPath(annotation.points)} fill="none" stroke={annotation.color} strokeWidth={(annotation.strokeWidth || 2.5) * zoom / 100} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" opacity={annotation.type === 'draw' ? 0.78 : 1} style={{ pointerEvents: interactive ? 'stroke' : 'none', touchAction: 'none' }} />
              {isSelected && <rect className="draw-selection" x={annotation.x * 1000} y={annotation.y * 1000} width={annotation.w * 1000} height={annotation.h * 1000} style={{ pointerEvents: 'none' }} />}
            </svg>
          );
        }
        if (annotation.type === 'highlight') {
          return (
            <div
              key={annotation.id}
              {...shared}
              className={`${shared.className} annotation-highlight`}
              style={{ ...shared.style, width: `${annotation.w * 100}%`, height: `${annotation.h * 100}%`, backgroundColor: withAlpha(annotation.color, annotation.opacity ?? 0.34) }}
            />
          );
        }
        if (annotation.type === 'whiteout') {
          return (
            <div
              key={annotation.id}
              {...shared}
              className={`${shared.className} annotation-whiteout`}
              style={{ ...shared.style, width: `${annotation.w * 100}%`, height: `${annotation.h * 100}%` }}
            />
          );
        }
        if (annotation.type === 'shape') {
          return (
            <ShapeSvg
              key={annotation.id}
              annotationId={annotation.id}
              shapeType={annotation.shapeType || 'rectangle'}
              x={annotation.x}
              y={annotation.y}
              w={annotation.w}
              h={annotation.h}
              points={annotation.points}
              color={annotation.color}
              strokeWidth={annotation.strokeWidth || 2.5}
              zoom={zoom}
              pageWidth={pageSize.width}
              pageHeight={pageSize.height}
              selected={isSelected}
              interactive={interactive}
            />
          );
        }
        if (annotation.type === 'note') {
          return (
            <div
              key={annotation.id}
              {...shared}
              className={`${shared.className} annotation-note`}
              style={{ ...shared.style, width: `${annotation.w * 100}%`, minHeight: `${annotation.h * 100}%`, borderLeftColor: annotation.color, fontSize: `${12 * zoom / 100}px` }}
            >
              <span className="note-dot" style={{ background: annotation.color }} />
              <span>{annotation.text}</span>
              {isSelected && tool === 'select' && <span className="annotation-resize-handle" data-resize-id={annotation.id} title="Drag to widen note" />}
            </div>
          );
        }
        return (
          <div
            key={annotation.id}
            {...shared}
            className={`${shared.className} annotation-text ${annotation.type === 'signature' ? 'annotation-signature' : ''}`}
            style={{
              ...shared.style,
              width: `${annotation.w * 100}%`,
              fontSize: `${(annotation.size || 22) * zoom / 100}px`,
              color: annotation.color,
              fontFamily: annotation.type === 'signature' ? undefined : annotation.fontFamily || 'Arial, sans-serif',
              fontWeight: annotation.bold ? 700 : 500,
              fontStyle: annotation.type === 'signature' || annotation.italic ? 'italic' : 'normal',
              textAlign: annotation.align || 'left',
            }}
          >
            {annotation.text}
            {isSelected && tool === 'select' && <span className="annotation-resize-handle" data-resize-id={annotation.id} title="Drag to widen text box" />}
          </div>
        );
      })}

      {draft && FREEHAND_TOOL_IDS.includes(draft.type) && (
        <svg className="drawing-draft" viewBox="0 0 1000 1000" preserveAspectRatio="none">
          <path d={draftPath(draft.points)} fill="none" stroke={currentColor} strokeWidth={(draft.type === 'pen' ? 3.2 : 2.2) * zoom / 100} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" opacity={draft.type === 'draw' ? 0.78 : 1} />
        </svg>
      )}
      {draft && SHAPE_TOOL_IDS.includes(draft.type) && (
        <ShapeSvg
          shapeType={draft.type === 'shape' ? 'rectangle' : draft.type}
          x={Math.min(draft.start.x, draft.current.x)}
          y={Math.min(draft.start.y, draft.current.y)}
          w={Math.abs(draft.current.x - draft.start.x)}
          h={Math.abs(draft.current.y - draft.start.y)}
          points={[draft.start, draft.current]}
          color={currentColor}
          strokeWidth={2.5}
          zoom={zoom}
          pageWidth={pageSize.width}
          pageHeight={pageSize.height}
          draft
        />
      )}
      {draft && !SHAPE_TOOL_IDS.includes(draft.type) && !FREEHAND_TOOL_IDS.includes(draft.type) && (
        <div
          className={`draft-rectangle draft-${draft.type}`}
          style={{
            left: `${Math.min(draft.start.x, draft.current.x) * 100}%`,
            top: `${Math.min(draft.start.y, draft.current.y) * 100}%`,
            width: `${Math.abs(draft.current.x - draft.start.x) * 100}%`,
            height: `${Math.abs(draft.current.y - draft.start.y) * 100}%`,
            borderColor: draft.type === 'whiteout' ? '#d3d0c8' : currentColor,
            backgroundColor: draft.type === 'highlight' ? withAlpha(currentColor, 0.3) : draft.type === 'whiteout' ? '#fff' : 'transparent',
          }}
        />
      )}
    </div>
  );
}

function App() {
  const [pdfDocument, setPdfDocument] = useState(null);
  const [pdfBytes, setPdfBytes] = useState(null);
  const [pageSizes, setPageSizes] = useState({});
  const [documentName, setDocumentName] = useState('Fieldnotes — a slower kind of living.pdf');
  const [pageIndex, setPageIndex] = useState(0);
  const [zoom, setZoom] = useState(82);
  const [tool, setTool] = useState('select');
  const [currentColor, setCurrentColor] = useState(DEFAULT_COLOR);
  const [annotations, setAnnotations] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [toast, setToast] = useState('');
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const fileInputRef = useRef(null);
  const pageStageRef = useRef(null);
  const pendingPageScrollRef = useRef(null);
  const toastTimerRef = useRef(null);
  const propertyEditSnapshotRef = useRef(null);

  const pageCount = pdfDocument?.numPages || 0;
  const pageSize = pageSizes[pageIndex] || { width: 612 * zoom / 100, height: 792 * zoom / 100 };
  const selectedAnnotation = annotations.find((item) => item.id === selectedId) || null;
  const activeTool = TOOL_OPTIONS.find((item) => item.id === tool) || TOOL_OPTIONS[0];
  const mobileSelectionLabel = selectedAnnotation
    ? selectedAnnotation.type === 'shape'
      ? SHAPE_LABELS[selectedAnnotation.shapeType] || 'Shape'
      : ({
        text: 'Text box',
        signature: 'Signature',
        note: 'Sticky note',
        highlight: 'Highlight',
        whiteout: 'Content cover',
        draw: 'Pencil mark',
        pen: 'Pen mark',
      }[selectedAnnotation.type] || 'Selected item')
    : null;
  const selectedToolId = selectedAnnotation?.type === 'shape'
    ? selectedAnnotation.shapeType === 'rectangle' ? 'shape' : selectedAnnotation.shapeType
    : selectedAnnotation?.type;
  const SelectedAnnotationIcon = TOOL_OPTIONS.find(({ id }) => id === selectedToolId)?.icon || Type;

  const showToast = useCallback((message) => {
    setToast(message);
    window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(''), 3200);
  }, []);

  const updatePageSize = useCallback((index, size) => {
    setPageSizes((current) => {
      const previous = current[index];
      if (previous && Math.abs(previous.width - size.width) < 0.5 && Math.abs(previous.height - size.height) < 0.5) return current;
      return { ...current, [index]: size };
    });
  }, []);

  const focusPage = useCallback((index) => {
    const stage = pageStageRef.current;
    const page = stage?.querySelector(`[data-page-index="${index}"]`);
    if (!stage || !page) return false;
    const stageRect = stage.getBoundingClientRect();
    const pageRect = page.getBoundingClientRect();
    stage.scrollTo({ top: stage.scrollTop + pageRect.top - stageRect.top - 12, behavior: 'smooth' });
    return true;
  }, []);

  useEffect(() => {
    const target = pendingPageScrollRef.current;
    if (target === null) return undefined;
    const frame = window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      focusPage(target);
      pendingPageScrollRef.current = null;
    }));
    return () => window.cancelAnimationFrame(frame);
  }, [pageIndex, pageCount, focusPage]);

  const goToPage = useCallback((index) => {
    const target = Math.min(Math.max(index, 0), Math.max(0, pageCount - 1));
    setSelectedId(null);
    setPageIndex(target);
    if (!focusPage(target)) window.requestAnimationFrame(() => focusPage(target));
  }, [pageCount, focusPage]);

  const handlePageStageScroll = useCallback(() => {
    const stage = pageStageRef.current;
    if (!stage) return;
    const bounds = stage.getBoundingClientRect();
    const anchor = bounds.top + Math.min(80, bounds.height * 0.18);
    const records = [...stage.querySelectorAll('[data-page-index]')];
    let nextPage = pageIndex;
    let closestDistance = Infinity;
    records.forEach((record) => {
      const rect = record.getBoundingClientRect();
      const index = Number(record.dataset.pageIndex);
      if (anchor >= rect.top && anchor <= rect.bottom) {
        nextPage = index;
        closestDistance = -1;
        return;
      }
      if (closestDistance === -1) return;
      const distance = Math.min(Math.abs(anchor - rect.top), Math.abs(anchor - rect.bottom));
      if (distance < closestDistance) {
        closestDistance = distance;
        nextPage = index;
      }
    });
    if (nextPage !== pageIndex) {
      setPageIndex(nextPage);
      setSelectedId(null);
    }
  }, [pageIndex]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const bytes = await createStarterPdf();
        const freshBytes = Uint8Array.from(bytes);
        const loadedDocument = await pdfjsLib.getDocument({ data: freshBytes.slice() }).promise;
        if (!alive) return;
        setPdfBytes(freshBytes);
        setPdfDocument(loadedDocument);
      } catch (error) {
        console.error(error);
        if (alive) showToast('Could not open the sample document. Try uploading a PDF.');
      }
    })();
    return () => {
      alive = false;
      window.clearTimeout(toastTimerRef.current);
    };
  }, [showToast]);

  useEffect(() => () => window.clearTimeout(toastTimerRef.current), []);

  const commitAnnotations = useCallback((snapshot) => {
    setUndoStack((stack) => [...stack, snapshot].slice(-60));
    setRedoStack([]);
    setDirty(true);
  }, []);

  const addAnnotation = (annotation) => {
    commitAnnotations(annotations);
    setAnnotations((items) => [...items, annotation]);
    setDirty(true);
  };

  const removeAnnotation = (id) => {
    const next = annotations.filter((item) => item.id !== id);
    if (next.length === annotations.length) return;
    commitAnnotations(annotations);
    setAnnotations(next);
    setSelectedId((current) => (current === id ? null : current));
    setDirty(true);
  };

  const updateAnnotation = (id, patch) => {
    setAnnotations((items) => items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
    setDirty(true);
  };

  const updateSelectedAnnotation = (patch) => {
    if (!selectedAnnotation) return;
    if (!propertyEditSnapshotRef.current) propertyEditSnapshotRef.current = annotations;
    updateAnnotation(selectedAnnotation.id, { ...patch, edited: true });
  };

  const finishPropertyEdit = () => {
    if (!propertyEditSnapshotRef.current) return;
    commitAnnotations(propertyEditSnapshotRef.current);
    propertyEditSnapshotRef.current = null;
  };

  const setAnnotationColor = (color) => {
    setCurrentColor(color);
    if (!selectedAnnotation || selectedAnnotation.color === color) return;
    finishPropertyEdit();
    commitAnnotations(annotations);
    updateAnnotation(selectedAnnotation.id, { color, edited: true });
  };

  const handleUndo = () => {
    if (!undoStack.length) return;
    const previous = undoStack[undoStack.length - 1];
    setRedoStack((stack) => [...stack, annotations]);
    setAnnotations(previous);
    setUndoStack((stack) => stack.slice(0, -1));
    setSelectedId(null);
    setDirty(true);
  };

  const handleRedo = () => {
    if (!redoStack.length) return;
    const next = redoStack[redoStack.length - 1];
    setUndoStack((stack) => [...stack, annotations]);
    setAnnotations(next);
    setRedoStack((stack) => stack.slice(0, -1));
    setSelectedId(null);
    setDirty(true);
  };

  const installPdf = async (bytes, nextName, nextPage = 0, preserveAnnotations = false) => {
    const cleanBytes = Uint8Array.from(bytes);
    const proxy = await pdfjsLib.getDocument({ data: cleanBytes.slice() }).promise;
    setPdfBytes(cleanBytes);
    setPdfDocument(proxy);
    setPageIndex(Math.min(Math.max(nextPage, 0), proxy.numPages - 1));
    setPageSizes({});
    setDocumentName(nextName || 'Untitled.pdf');
    if (!preserveAnnotations) {
      setAnnotations([]);
      setSelectedId(null);
      setUndoStack([]);
      setRedoStack([]);
      setDirty(false);
    }
  };

  const handleFile = async (file) => {
    if (!file) return;
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      showToast('Please choose a PDF file.');
      return;
    }
    setBusy(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      await installPdf(bytes, file.name, 0);
      setZoom(82);
      pageStageRef.current?.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
      showToast(`Opened ${file.name}`);
    } catch (error) {
      console.error(error);
      showToast('That PDF could not be opened. It may be protected or damaged.');
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const savePdfBytes = async (updatedBytes, nextPage = pageIndex) => {
    await installPdf(updatedBytes, documentName, nextPage, true);
    setSelectedId(null);
    setUndoStack([]);
    setRedoStack([]);
    setDirty(true);
  };

  const handleAddPage = async () => {
    if (!pdfBytes) return;
    setBusy(true);
    try {
      const document = await PDFDocument.load(pdfBytes.slice());
      document.addPage([612, 792]);
      const bytes = await document.save();
      const addedIndex = document.getPageCount() - 1;
      pendingPageScrollRef.current = addedIndex;
      await savePdfBytes(bytes, addedIndex);
      showToast('Blank page added');
    } catch (error) {
      console.error(error);
      showToast('Could not add a page to this PDF.');
    } finally {
      setBusy(false);
    }
  };

  const handleDuplicatePage = async () => {
    if (!pdfBytes) return;
    setBusy(true);
    try {
      const document = await PDFDocument.load(pdfBytes.slice());
      const [copy] = await document.copyPages(document, [pageIndex]);
      const insertionIndex = pageIndex + 1;
      document.insertPage(insertionIndex, copy);
      const bytes = await document.save();
      const copiedAnnotations = annotations
        .filter((item) => item.pageIndex === pageIndex)
        .map((item) => ({ ...item, id: makeId(), pageIndex: insertionIndex }));
      const shifted = annotations.map((item) => item.pageIndex > pageIndex ? { ...item, pageIndex: item.pageIndex + 1 } : item);
      setAnnotations([...shifted, ...copiedAnnotations]);
      pendingPageScrollRef.current = insertionIndex;
      await savePdfBytes(bytes, insertionIndex);
      setAnnotations([...shifted, ...copiedAnnotations]);
      setDirty(true);
      showToast('Page duplicated');
    } catch (error) {
      console.error(error);
      showToast('Could not duplicate this page.');
    } finally {
      setBusy(false);
    }
  };

  const handleDeletePage = async () => {
    if (!pdfBytes || !pdfDocument) return;
    if (pageCount <= 1) {
      showToast('A PDF needs to have at least one page.');
      return;
    }
    setBusy(true);
    try {
      const deletedIndex = pageIndex;
      const document = await PDFDocument.load(pdfBytes.slice());
      document.removePage(deletedIndex);
      const bytes = await document.save();
      const nextAnnotations = annotations
        .filter((item) => item.pageIndex !== deletedIndex)
        .map((item) => item.pageIndex > deletedIndex ? { ...item, pageIndex: item.pageIndex - 1 } : item);
      const nextPage = Math.min(deletedIndex, pageCount - 2);
      pendingPageScrollRef.current = nextPage;
      await savePdfBytes(bytes, nextPage);
      setAnnotations(nextAnnotations);
      setDirty(true);
      showToast('Page removed');
    } catch (error) {
      console.error(error);
      showToast('Could not remove this page.');
    } finally {
      setBusy(false);
    }
  };

  const handleExport = async () => {
    if (!pdfBytes || busy) return;
    setBusy(true);
    try {
      const document = await PDFDocument.load(pdfBytes.slice());
      const regular = await document.embedFont(StandardFonts.Helvetica);
      const italic = await document.embedFont(StandardFonts.HelveticaOblique);
      const bold = await document.embedFont(StandardFonts.HelveticaBold);
      const boldItalic = await document.embedFont(StandardFonts.HelveticaBoldOblique);
      const serif = await document.embedFont(StandardFonts.TimesRoman);
      const serifBold = await document.embedFont(StandardFonts.TimesRomanBold);
      const serifItalic = await document.embedFont(StandardFonts.TimesRomanItalic);
      const serifBoldItalic = await document.embedFont(StandardFonts.TimesRomanBoldItalic);
      const mono = await document.embedFont(StandardFonts.Courier);
      const monoBold = await document.embedFont(StandardFonts.CourierBold);
      const monoItalic = await document.embedFont(StandardFonts.CourierOblique);
      const monoBoldItalic = await document.embedFont(StandardFonts.CourierBoldOblique);
      const signatureFont = serifItalic;
      const chooseFont = (annotation) => {
        if (annotation.type === 'signature') return signatureFont;
        const family = String(annotation.fontFamily || '').toLowerCase();
        const isMono = family.includes('courier') || family.includes('mono');
        const isSerif = family.includes('times') || family.includes('serif');
        if (isMono) return annotation.bold ? (annotation.italic ? monoBoldItalic : monoBold) : (annotation.italic ? monoItalic : mono);
        if (isSerif) return annotation.bold ? (annotation.italic ? serifBoldItalic : serifBold) : (annotation.italic ? serifItalic : serif);
        return annotation.bold ? (annotation.italic ? boldItalic : bold) : (annotation.italic ? italic : regular);
      };

      annotations.forEach((annotation) => {
        if (annotation.pageIndex < 0 || annotation.pageIndex >= document.getPageCount()) return;
        const page = document.getPage(annotation.pageIndex);
        const width = page.getWidth();
        const height = page.getHeight();
        const x = annotation.x * width;
        const top = annotation.y * height;
        const boxWidth = annotation.w * width;
        const boxHeight = annotation.h * height;
        const color = colorToRgb(annotation.color || DEFAULT_COLOR);

        if (annotation.type === 'whiteout') {
          page.drawRectangle({
            x,
            y: height - top - boxHeight,
            width: boxWidth,
            height: boxHeight,
            color: colorToRgb('#FFFFFF'),
          });
          return;
        }
        if (annotation.type === 'highlight') {
          page.drawRectangle({
            x,
            y: height - top - boxHeight,
            width: boxWidth,
            height: boxHeight,
            color,
            opacity: annotation.opacity ?? 0.34,
          });
          return;
        }
        if (annotation.type === 'shape') {
          const shapeType = annotation.shapeType || 'rectangle';
          const strokeWidth = annotation.strokeWidth || 2.5;
          const bottom = height - top - boxHeight;
          if (shapeType === 'line' || shapeType === 'arrow') {
            const [first = { x: annotation.x, y: annotation.y }, second = { x: annotation.x + annotation.w, y: annotation.y + annotation.h }] = annotation.points || [];
            const start = { x: first.x * width, y: height - first.y * height };
            const end = { x: second.x * width, y: height - second.y * height };
            page.drawLine({ start, end, thickness: strokeWidth, color, lineCap: 'Round' });
            if (shapeType === 'arrow') {
              const angle = Math.atan2(end.y - start.y, end.x - start.x);
              const headLength = Math.max(7, strokeWidth * 4);
              [-1, 1].forEach((side) => {
                const sideAngle = angle + Math.PI + side * Math.PI / 6;
                page.drawLine({
                  start: end,
                  end: { x: end.x + headLength * Math.cos(sideAngle), y: end.y + headLength * Math.sin(sideAngle) },
                  thickness: strokeWidth,
                  color,
                  lineCap: 'Round',
                });
              });
            }
            return;
          }
          if (shapeType === 'circle' || shapeType === 'oval' || shapeType === 'square') {
            let shapeX = x;
            let shapeY = bottom;
            let shapeWidth = boxWidth;
            let shapeHeight = boxHeight;
            if (shapeType === 'circle' || shapeType === 'square') {
              const size = Math.min(boxWidth, boxHeight);
              shapeX += (boxWidth - size) / 2;
              shapeY += (boxHeight - size) / 2;
              shapeWidth = size;
              shapeHeight = size;
            }
            if (shapeType === 'square') {
              page.drawRectangle({ x: shapeX, y: shapeY, width: shapeWidth, height: shapeHeight, borderColor: color, borderWidth: strokeWidth });
            } else {
              page.drawEllipse({ x: shapeX, y: shapeY, width: shapeWidth, height: shapeHeight, borderColor: color, borderWidth: strokeWidth });
            }
            return;
          }
          const vertices = polygonVertices(shapeType, annotation.x, annotation.y, annotation.w, annotation.h);
          if (vertices.length > 1) {
            vertices.forEach((vertex, index) => {
              const next = vertices[(index + 1) % vertices.length];
              page.drawLine({
                start: { x: vertex.x * width, y: height - vertex.y * height },
                end: { x: next.x * width, y: height - next.y * height },
                thickness: strokeWidth,
                color,
                lineCap: 'Round',
              });
            });
          } else {
            page.drawRectangle({ x, y: bottom, width: boxWidth, height: boxHeight, borderColor: color, borderWidth: strokeWidth });
          }
          return;
        }
        if (FREEHAND_TOOL_IDS.includes(annotation.type)) {
          const points = annotation.points || [];
          for (let index = 1; index < points.length; index += 1) {
            const start = points[index - 1];
            const end = points[index];
            page.drawLine({
              start: { x: start.x * width, y: height - start.y * height },
              end: { x: end.x * width, y: height - end.y * height },
              thickness: annotation.strokeWidth || 2.5,
              color,
              opacity: annotation.type === 'draw' ? 0.78 : 1,
              lineCap: 'Round',
            });
          }
          return;
        }
        if (annotation.type === 'note') {
          page.drawRectangle({
            x,
            y: height - top - boxHeight,
            width: boxWidth,
            height: boxHeight,
            color: colorToRgb('#FFF5D7'),
            borderColor: color,
            borderWidth: 1.1,
          });
          drawWrappedText(page, annotation.text || '', {
            x: x + 9,
            y: height - top - 14,
            maxWidth: Math.max(20, boxWidth - 18),
            font: regular,
            size: 10,
            lineHeight: 12,
            color: colorToRgb('#38372F'),
          });
          return;
        }
        const size = annotation.size || 22;
        const font = chooseFont(annotation);
        drawWrappedText(page, annotation.text || '', {
          x,
          y: height - top - size,
          maxWidth: Math.max(size, boxWidth),
          font,
          size,
          lineHeight: size * 1.2,
          color,
          align: annotation.align || 'left',
        });
      });

      const output = await document.save();
      const blob = new Blob([output], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const anchor = window.document.createElement('a');
      anchor.href = url;
      const safeName = documentName.replace(/\.pdf$/i, '').trim() || 'document';
      anchor.download = `${safeName}-edited.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
      setDirty(false);
      showToast('Your edited PDF is ready to download');
    } catch (error) {
      console.error(error);
      showToast('Could not export this PDF. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleZoom = (value) => setZoom(Math.min(200, Math.max(40, value)));

  const handleFit = () => {
    if (!pdfDocument) return;
    pdfDocument.getPage(pageIndex + 1).then((page) => {
      const base = page.getViewport({ scale: 1 });
      const workspace = document.querySelector('.canvas-workspace');
      if (!workspace) return;
      const availableWidth = workspace.clientWidth - 96;
      const availableHeight = workspace.clientHeight - 72;
      const nextZoom = Math.floor(Math.min(availableWidth / base.width, availableHeight / base.height, 1.4) * 100);
      handleZoom(Math.max(40, Math.min(150, nextZoom)));
    });
  };

  useEffect(() => {
    const onKeyDown = (event) => {
      const targetTag = event.target?.tagName?.toLowerCase();
      const editingText = targetTag === 'textarea' || targetTag === 'input' || event.target?.isContentEditable;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        if (editingText) return;
        event.preventDefault();
        if (event.shiftKey) handleRedo();
        else handleUndo();
      }
      if (!editingText && (event.key === 'Delete' || event.key === 'Backspace') && selectedId) {
        event.preventDefault();
        removeAnnotation(selectedId);
      }
      if (!editingText && event.key === 'Escape') setSelectedId(null);
      const shortcuts = { v: 'select', e: 'eraser', t: 'text', h: 'highlight', d: 'draw', p: 'pen', l: 'line', a: 'arrow', r: 'shape', c: 'circle' };
      if (!editingText && shortcuts[event.key.toLowerCase()]) setTool(shortcuts[event.key.toLowerCase()]);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const onDropFile = (event) => {
    event.preventDefault();
    setIsDraggingFile(false);
    const file = event.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const pageInfo = useMemo(() => {
    if (!pageSize.width || !pageSize.height || !zoom) return 'PDF page';
    const width = Math.round(pageSize.width / (zoom / 100));
    const height = Math.round(pageSize.height / (zoom / 100));
    return `${width} × ${height} pt`;
  }, [pageSize, zoom]);

  return (
    <div
      className={`app-shell ${isDraggingFile ? 'is-file-dragging' : ''}`}
      onDragOver={(event) => { event.preventDefault(); setIsDraggingFile(true); }}
      onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setIsDraggingFile(false); }}
      onDrop={onDropFile}
    >
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark"><FileText size={19} strokeWidth={2.1} /></div>
          <div className="brand-wordmark">Lal Construction</div>
          <div className="brand-divider" />
          <div className="workspace-label">MEP DOCUMENT EDITOR</div>
        </div>

        <div className="document-title-wrap">
          <input
            className="document-title"
            value={documentName}
            onChange={(event) => setDocumentName(event.target.value)}
            aria-label="Document name"
            spellCheck="false"
          />
          <div className={`save-indicator ${dirty ? 'unsaved' : ''}`}>
            <span className="save-dot" />
            <span>{dirty ? 'Changes not downloaded' : 'Private workspace'}</span>
          </div>
        </div>

        <div className="topbar-actions">
          <div className="history-actions" aria-label="Edit history">
            <button className="icon-button" type="button" onClick={handleUndo} disabled={!undoStack.length} title="Undo (Ctrl/⌘ Z)" aria-label="Undo">
              <Undo2 size={17} />
            </button>
            <button className="icon-button" type="button" onClick={handleRedo} disabled={!redoStack.length} title="Redo (Ctrl/⌘ Shift Z)" aria-label="Redo">
              <Redo2 size={17} />
            </button>
          </div>
          <button className="top-open-button" type="button" onClick={() => fileInputRef.current?.click()}>
            <Upload size={15} /> <span>Open PDF</span>
          </button>
          <button className="download-button" type="button" onClick={handleExport} disabled={!pdfDocument || busy}>
            {busy ? <LoaderCircle className="spin" size={16} /> : <Download size={16} />}
            <span>{busy ? 'Working…' : 'Download PDF'}</span>
          </button>
          <button className="mobile-inspector-toggle" type="button" onClick={() => setInspectorOpen((open) => !open)} aria-label="Toggle properties">
            <Info size={17} />
          </button>
        </div>
        <input ref={fileInputRef} className="visually-hidden" type="file" accept="application/pdf,.pdf" onChange={(event) => handleFile(event.target.files?.[0])} />
      </header>

      <div className="editor-layout">
        <aside className="tool-sidebar">
          <div className="sidebar-scroll">
            <div className="sidebar-upload-card">
              <div className="upload-card-icon"><Upload size={17} /></div>
              <div className="upload-card-copy"><strong>Start with your PDF</strong><span>Everything stays on your device.</span></div>
              <button type="button" className="upload-card-button" onClick={() => fileInputRef.current?.click()}>
                <Upload size={14} /> Open a file
              </button>
            </div>

            <div className="section-heading"><span>TOOLS</span><span className="tool-count">{String(TOOL_OPTIONS.length).padStart(2, '0')}</span></div>
            <div className="tool-list">
              {TOOL_OPTIONS.map(({ id, label, hint, icon: Icon }) => (
                <button
                  type="button"
                  key={id}
                  className={`tool-button ${tool === id ? 'active' : ''}`}
                  onClick={() => setTool(id)}
                  title={`${label} — ${hint}`}
                  aria-pressed={tool === id}
                >
                  <span className="tool-icon"><Icon size={17} strokeWidth={1.8} /></span>
                  <span className="tool-copy"><span>{label}</span><small>{hint}</small></span>
                  {tool === id && <span className="tool-active-dot" />}
                </button>
              ))}
            </div>

            <div className="pages-heading-row">
              <div className="section-heading pages-title"><span>PAGES</span><span className="page-count">{String(pageCount).padStart(2, '0')}</span></div>
              <button type="button" className="tiny-icon-button" onClick={handleAddPage} title="Add a blank page" aria-label="Add a page" disabled={!pdfDocument || busy}>
                <Plus size={15} />
              </button>
            </div>
            <div className="page-thumbnails">
              {pdfDocument && Array.from({ length: pageCount }, (_, index) => (
                <PageThumbnail
                  key={`${index}-${pageCount}`}
                  document={pdfDocument}
                  pageNumber={index + 1}
                  active={pageIndex === index}
                  onClick={() => goToPage(index)}
                />
              ))}
              {!pdfDocument && <div className="thumb-loading"><LoaderCircle className="spin" size={18} /> Preparing pages</div>}
            </div>
            <button className="add-page-wide" type="button" onClick={handleAddPage} disabled={!pdfDocument || busy}>
              <Plus size={15} /> Add blank page
            </button>
          </div>
          <div className="sidebar-footer">
            <span className="privacy-lock"><LockKeyhole size={13} /> Private by design</span>
            <span className="sidebar-version">FOLIO 01</span>
          </div>
        </aside>

        <main className="canvas-column">
          <div className="canvas-toolbar">
            <div className="canvas-toolbar-left">
              <div className="page-navigation">
                <button type="button" className="toolbar-icon-button" onClick={() => goToPage(pageIndex - 1)} disabled={pageIndex <= 0} aria-label="Previous page" title="Previous page">
                  <ChevronLeft size={16} />
                </button>
                <span className="page-number-display"><strong>{String(pageIndex + 1).padStart(2, '0')}</strong><span>/</span>{String(pageCount).padStart(2, '0')}</span>
                <button type="button" className="toolbar-icon-button" onClick={() => goToPage(pageIndex + 1)} disabled={pageIndex >= pageCount - 1} aria-label="Next page" title="Next page">
                  <ChevronRight size={16} />
                </button>
              </div>
              <span className="toolbar-divider" />
              <div className="active-tool-caption"><span className="active-tool-indicator" style={{ background: tool === 'select' ? '#7768d6' : currentColor }} /><span>{activeTool.label}</span><span className="tool-caption-hint">{tool === 'select' ? 'Click an item to select it' : ['highlight', 'whiteout', ...SHAPE_TOOL_IDS, ...FREEHAND_TOOL_IDS].includes(tool) ? 'Click and drag on the page' : 'Click to place on the page'}</span></div>
            </div>
            <div className="canvas-toolbar-right">
              <button type="button" className="toolbar-icon-button zoom-control" onClick={() => handleZoom(zoom - 10)} disabled={zoom <= 40} aria-label="Zoom out" title="Zoom out">
                <ZoomOut size={16} />
              </button>
              <button type="button" className="zoom-value" onClick={handleFit} title="Fit page to workspace">{zoom}%</button>
              <button type="button" className="toolbar-icon-button zoom-control" onClick={() => handleZoom(zoom + 10)} disabled={zoom >= 200} aria-label="Zoom in" title="Zoom in">
                <ZoomIn size={16} />
              </button>
              <span className="toolbar-divider" />
              <button type="button" className="fit-button" onClick={handleFit}><span>Fit</span><span className="fit-glyph">↗</span></button>
              <span className="toolbar-divider desktop-divider" />
              <button type="button" className="toolbar-icon-button delete-page-button" onClick={handleDeletePage} disabled={pageCount <= 1 || busy} title="Remove current page" aria-label="Remove current page">
                <Trash2 size={15} />
              </button>
            </div>
          </div>

          <div className="canvas-workspace" onDoubleClick={(event) => { if (event.target === event.currentTarget) handleFit(); }}>
            <div className="workspace-topline"><span><span className="workspace-live-dot" /> LIVE PREVIEW</span><span>{pageInfo}</span></div>
            <div id="page-stage" ref={pageStageRef} className="page-stage" onScroll={handlePageStageScroll}>
              {!pdfDocument ? (
                <div className="loading-document"><LoaderCircle className="spin" size={24} /><span>Preparing your workspace…</span></div>
              ) : (
                <div className="document-page-stack">
                  {Array.from({ length: pageCount }, (_, index) => (
                    <PdfPage
                      key={`${index}-${pageCount}`}
                      pdfDocument={pdfDocument}
                      pageIndex={index}
                      pageStageRef={pageStageRef}
                      zoom={zoom}
                      active={pageIndex === index}
                      annotations={annotations}
                      tool={tool}
                      currentColor={currentColor}
                      selectedId={selectedId}
                      setSelectedId={setSelectedId}
                      addAnnotation={addAnnotation}
                      commitAnnotations={commitAnnotations}
                      updateAnnotation={updateAnnotation}
                      removeAnnotation={removeAnnotation}
                      onPageSize={updatePageSize}
                    />
                  ))}
                </div>
              )}
            </div>
            <div className="workspace-bottomline">
              <span><ShieldCheck size={14} /> Edits preview instantly</span>
              <span>Scroll to move through pages · Drop a PDF anywhere to open it</span>
            </div>
          </div>
          {pdfDocument && selectedAnnotation ? (
            <MobilePropertiesBar
              annotation={selectedAnnotation}
              label={mobileSelectionLabel}
              currentColor={currentColor}
              onUpdate={updateSelectedAnnotation}
              onColorChange={setAnnotationColor}
              onFinish={finishPropertyEdit}
              onDelete={removeAnnotation}
              onMore={() => setInspectorOpen(true)}
            />
          ) : pdfDocument && (
            <div className="mobile-page-details-bar">
              <span className="mobile-page-details-icon"><FileText size={17} /></span>
              <span className="mobile-page-details-copy">
                <strong>Page {String(pageIndex + 1).padStart(2, '0')} / {String(pageCount).padStart(2, '0')}</strong>
                <small>{pageInfo} · Swipe to pan</small>
              </span>
              <button type="button" className="mobile-page-details-action" onClick={() => setInspectorOpen(true)} aria-label="Open page details" title="Open page details">
                <Info size={15} /><span>Details</span>
              </button>
            </div>
          )}
          <nav className="mobile-tool-dock" aria-label="PDF editing tools">
            {TOOL_OPTIONS.map(({ id, label, icon: Icon }) => (
              <button type="button" key={id} className={tool === id ? 'active' : ''} onClick={() => setTool(id)} aria-label={label} aria-pressed={tool === id} title={label}>
                <Icon size={16} /><span className="mobile-tool-label">{label}</span>
              </button>
            ))}
            <button type="button" onClick={() => fileInputRef.current?.click()} aria-label="Open PDF" title="Open PDF"><Upload size={16} /><span className="mobile-tool-label">Open PDF</span></button>
          </nav>
        </main>

        <aside className={`inspector-sidebar ${inspectorOpen ? 'inspector-open' : ''}`}>
          <div className="inspector-scroll">
            <div className="inspector-header"><div><span className="inspector-kicker">WORKSPACE</span><h2>{selectedAnnotation ? 'Properties' : 'Page details'}</h2></div><button type="button" className="close-inspector" onClick={() => setInspectorOpen(false)} aria-label="Close properties"><X size={16} /></button></div>

            {selectedAnnotation ? (
              <>
                <div className="selection-card">
                  <div className={`selection-icon selection-${selectedAnnotation.type}`}><SelectedAnnotationIcon size={17} /></div>
                  <div><strong>{mobileSelectionLabel}</strong><span>Page {selectedAnnotation.pageIndex + 1}</span></div>
                  <button className="mini-delete" type="button" onClick={() => removeAnnotation(selectedAnnotation.id)} title="Delete item" aria-label="Delete selected item"><Trash2 size={15} /></button>
                </div>

                {['text', 'signature', 'note'].includes(selectedAnnotation.type) && (
                  <div className="property-field text-property-field">
                    <label htmlFor="annotation-copy">{selectedAnnotation.type === 'signature' ? 'SIGNATURE' : selectedAnnotation.type === 'note' ? 'NOTE CONTENT' : 'TEXT CONTENT'}</label>
                    <textarea
                      id="annotation-copy"
                      rows={selectedAnnotation.type === 'note' ? 4 : 3}
                      value={selectedAnnotation.text || ''}
                      onChange={(event) => updateSelectedAnnotation({ text: event.target.value })}
                      onBlur={finishPropertyEdit}
                      placeholder="Write something…"
                    />
                    <span className="field-footnote">Your changes appear on the page as you type.</span>
                  </div>
                )}

                {['text', 'signature'].includes(selectedAnnotation.type) && (
                  <div className="property-field">
                    <div className="slider-heading"><label htmlFor="text-size">SIZE</label><span>{selectedAnnotation.size || 22} pt</span></div>
                    <input id="text-size" className="range-input" type="range" min="6" max="72" step="1" value={selectedAnnotation.size || 22} onChange={(event) => updateSelectedAnnotation({ size: Number(event.target.value) })} onBlur={finishPropertyEdit} />
                    <div className="range-scale"><span>Small</span><span>Large</span></div>
                  </div>
                )}

                {selectedAnnotation.type === 'text' && (
                  <div className="font-formatting-section">
                    <div className="inspector-section-title">FONT FORMATTING</div>
                    <label className="format-label" htmlFor="font-family">FONT FAMILY</label>
                    <select
                      id="font-family"
                      className="font-select"
                      value={selectedAnnotation.fontFamily || 'Arial'}
                      onChange={(event) => updateSelectedAnnotation({ fontFamily: event.target.value })}
                      onBlur={finishPropertyEdit}
                    >
                      <option value="Arial">Arial / Sans</option>
                      <option value="Times New Roman">Times New Roman / Serif</option>
                      <option value="Courier New">Courier New / Monospace</option>
                    </select>
                    <div className="format-toggle-row">
                      <button type="button" className={`format-toggle ${selectedAnnotation.bold ? 'active' : ''}`} onClick={() => { updateSelectedAnnotation({ bold: !selectedAnnotation.bold }); finishPropertyEdit(); }}><b>B</b><span>Bold</span></button>
                      <button type="button" className={`format-toggle italic-toggle ${selectedAnnotation.italic ? 'active' : ''}`} onClick={() => { updateSelectedAnnotation({ italic: !selectedAnnotation.italic }); finishPropertyEdit(); }}><i>I</i><span>Italic</span></button>
                    </div>
                    <div className="format-alignment" role="group" aria-label="Text alignment">
                      {['left', 'center', 'right'].map((align) => (
                        <button key={align} type="button" className={selectedAnnotation.align === align || (!selectedAnnotation.align && align === 'left') ? 'active' : ''} onClick={() => { updateSelectedAnnotation({ align }); finishPropertyEdit(); }} aria-label={`Align ${align}`} title={`Align ${align}`}>
                          {align === 'left' ? 'L' : align === 'center' ? 'C' : 'R'}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {['text', 'signature', 'note'].includes(selectedAnnotation.type) && (
                  <div className="property-field">
                    <div className="slider-heading"><label htmlFor="text-box-width">BOX WIDTH</label><span>{Math.round(selectedAnnotation.w * 100)}% page</span></div>
                    <input
                      id="text-box-width"
                      className="range-input"
                      type="range"
                      min="5"
                      max={Math.max(5, Math.floor((1 - selectedAnnotation.x) * 100))}
                      step="1"
                      value={Math.min(Math.max(5, Math.floor((1 - selectedAnnotation.x) * 100)), Math.max(5, Math.round(selectedAnnotation.w * 100)))}
                      onChange={(event) => updateSelectedAnnotation({ w: Number(event.target.value) / 100 })}
                      onBlur={finishPropertyEdit}
                    />
                    <div className="range-scale"><span>Narrow</span><span>Wide</span></div>
                  </div>
                )}

                {selectedAnnotation.type !== 'whiteout' && <Palette value={selectedAnnotation.color || currentColor} onChange={setAnnotationColor} label="INK COLOR" />}

                {selectedAnnotation.type === 'highlight' && (
                  <div className="property-field">
                    <div className="slider-heading"><label htmlFor="highlight-opacity">OPACITY</label><span>{Math.round((selectedAnnotation.opacity ?? 0.34) * 100)}%</span></div>
                    <input id="highlight-opacity" className="range-input" type="range" min="10" max="80" step="5" value={Math.round((selectedAnnotation.opacity ?? 0.34) * 100)} onChange={(event) => updateSelectedAnnotation({ opacity: Number(event.target.value) / 100 })} onBlur={finishPropertyEdit} />
                  </div>
                )}

                {['shape', 'draw', 'pen'].includes(selectedAnnotation.type) && (
                  <div className="property-field">
                    <div className="slider-heading"><label htmlFor="line-weight">{['draw', 'pen'].includes(selectedAnnotation.type) ? 'THICKNESS' : 'LINE WEIGHT'}</label><span>{selectedAnnotation.strokeWidth || 2.5} px</span></div>
                    <input id="line-weight" className="range-input" type="range" min="1" max="8" step="0.5" value={selectedAnnotation.strokeWidth || 2.5} onChange={(event) => updateSelectedAnnotation({ strokeWidth: Number(event.target.value) })} onBlur={finishPropertyEdit} />
                  </div>
                )}

                <div className="inspector-tip"><Info size={15} /><span>{selectedAnnotation.type === 'whiteout' ? 'This covers page content visually; it does not remove underlying PDF data.' : 'Drag the item on the page to reposition it. It will be included in your downloaded PDF.'}</span></div>
              </>
            ) : (
              <>
                <div className="page-summary-card">
                  <div className="page-summary-paper"><FileText size={20} strokeWidth={1.5} /><span>{String(pageIndex + 1).padStart(2, '0')}</span></div>
                  <div className="page-summary-copy"><strong>Page {String(pageIndex + 1).padStart(2, '0')}</strong><span>{pageInfo}</span><small>{pageCount} {pageCount === 1 ? 'page' : 'pages'} in this document</small></div>
                </div>

                <Palette value={currentColor} onChange={setAnnotationColor} label="QUICK COLOR" />

                <div className="inspector-section-title"><span>PAGE ACTIONS</span></div>
                <div className="page-action-list">
                  <button type="button" className="page-action-button" onClick={handleAddPage} disabled={busy}>
                    <span className="page-action-icon lavender"><FilePlus2 size={16} /></span><span><strong>Add a blank page</strong><small>Append a fresh page</small></span><Plus size={15} className="page-action-trailing" />
                  </button>
                  <button type="button" className="page-action-button" onClick={handleDuplicatePage} disabled={busy || !pdfDocument}>
                    <span className="page-action-icon mint"><FileText size={16} /></span><span><strong>Duplicate this page</strong><small>Keep a copy to work on</small></span><Plus size={15} className="page-action-trailing" />
                  </button>
                  <button type="button" className="page-action-button danger-action" onClick={handleDeletePage} disabled={busy || pageCount <= 1}>
                    <span className="page-action-icon rose"><Trash2 size={16} /></span><span><strong>Remove this page</strong><small>{pageCount <= 1 ? 'Keep at least one page' : 'This cannot be undone'}</small></span>
                  </button>
                </div>

                <div className="inspector-note-card">
                  <span className="note-shield"><LockKeyhole size={14} /></span>
                  <span><strong>Your files stay yours</strong><small>PDFs are opened and edited locally in this browser. Nothing is uploaded to a server.</small></span>
                </div>
              </>
            )}
          </div>
          <div className="inspector-footer"><span><span className="footer-check"><Check size={10} /></span>{dirty ? 'Ready to download' : 'Local & private'}</span><span>HELP <span className="help-dot">?</span></span></div>
        </aside>
      </div>

      {isDraggingFile && <div className="drop-overlay"><div className="drop-message"><div className="drop-icon"><Upload size={24} /></div><strong>Drop your PDF here</strong><span>It opens locally in your browser</span></div></div>}
      {toast && <div className="toast-message"><span className="toast-check"><Check size={13} /></span>{toast}</div>}
      {busy && <div className="busy-progress" aria-hidden="true"><span /></div>}
    </div>
  );
}

export default App;
