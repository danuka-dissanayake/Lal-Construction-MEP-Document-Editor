import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Eraser,
  FilePlus2,
  FileText,
  Highlighter,
  Info,
  LoaderCircle,
  LockKeyhole,
  MessageSquareText,
  MousePointer2,
  PenTool,
  Pencil,
  Plus,
  Redo2,
  ShieldCheck,
  Square,
  Trash2,
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

const TOOL_OPTIONS = [
  { id: 'select', label: 'Select', hint: 'Move things around', icon: MousePointer2 },
  { id: 'text', label: 'Add text', hint: 'Place a text box', icon: Type },
  { id: 'highlight', label: 'Highlight', hint: 'Drag over a passage', icon: Highlighter },
  { id: 'whiteout', label: 'Whiteout', hint: 'Cover existing content', icon: Eraser },
  { id: 'draw', label: 'Freehand', hint: 'Sketch on the page', icon: Pencil },
  { id: 'shape', label: 'Rectangle', hint: 'Draw a simple shape', icon: Square },
  { id: 'signature', label: 'Signature', hint: 'Add a written sign-off', icon: PenTool },
  { id: 'note', label: 'Sticky note', hint: 'Leave yourself a note', icon: MessageSquareText },
  { id: 'eraser', label: 'Eraser', hint: 'Remove an annotation', icon: Trash2 },
];

const TOOL_CURSORS = {
  select: 'default',
  text: 'text',
  highlight: 'crosshair',
  whiteout: 'crosshair',
  draw: 'crosshair',
  shape: 'crosshair',
  signature: 'copy',
  note: 'copy',
  eraser: 'not-allowed',
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

function makeId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `note-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function drawWrappedText(page, text, options) {
  const { font, size, color, x, y, maxWidth, lineHeight, opacity } = options;
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
    page.drawText(line, {
      x,
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
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!document || !canvasRef.current) return undefined;
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
  }, [document, pageNumber]);

  return (
    <button className={`page-thumb ${active ? 'active' : ''}`} onClick={onClick} type="button" aria-label={`Go to page ${pageNumber}`}>
      <span className="thumb-paper"><canvas ref={canvasRef} /></span>
      <span className="thumb-meta"><span className="thumb-number">{String(pageNumber).padStart(2, '0')}</span><span className="thumb-name">Page {pageNumber}</span></span>
    </button>
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
    const target = event.target.closest?.('[data-annotation-id]');
    const targetId = target?.dataset.annotationId;

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
        opacity: 0.34,
        strokeWidth: 2.5,
      };
      addAnnotation(annotation);
      setSelectedId(annotation.id);
      return;
    }

    if (['highlight', 'whiteout', 'shape', 'draw'].includes(tool)) {
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
      const dy = point.y - drag.startY;
      updateAnnotation(drag.id, {
        x: clamp(drag.originalX + dx, -0.2, 0.95),
        y: clamp(drag.originalY + dy, -0.2, 0.95),
      });
      return;
    }
    const activeDraft = draftRef.current;
    if (!activeDraft || activeDraft.pointerId !== event.pointerId) return;
    const next = {
      ...activeDraft,
      current: point,
      points: activeDraft.type === 'draw' ? [...activeDraft.points, point] : activeDraft.points,
    };
    draftRef.current = next;
    setDraft(next);
  };

  const handlePointerUp = (event) => {
    const drag = dragRef.current;
    if (drag && drag.pointerId === event.pointerId) {
      commitAnnotations(drag.originalAnnotations);
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
    if (type === 'draw' ? points.length > 1 : width > 0.003 || height > 0.003) {
      const annotation = {
        id: makeId(),
        type,
        pageIndex: currentPage,
        x: left,
        y: top,
        w: Math.max(width, 0.005),
        h: Math.max(height, type === 'highlight' ? 0.018 : 0.005),
        points: type === 'draw' ? points : undefined,
        color: currentColor,
        size: 22,
        opacity: 0.34,
        strokeWidth: 2.5,
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
      style={{ width: pageSize.width, height: pageSize.height, cursor: TOOL_CURSORS[tool] || 'default' }}
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
        if (annotation.type === 'draw') {
          return (
            <svg
              key={annotation.id}
              data-annotation-id={annotation.id}
              className={`annotation-item annotation-draw ${isSelected ? 'is-selected' : ''}`}
              viewBox="0 0 1000 1000"
              preserveAspectRatio="none"
              style={{ left: 0, top: 0, width: '100%', height: '100%', overflow: 'visible', pointerEvents: 'none' }}
            >
              <path d={draftPath(annotation.points)} fill="none" stroke={annotation.color} strokeWidth={(annotation.strokeWidth || 2.5) * zoom / 100} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" style={{ pointerEvents: interactive ? 'stroke' : 'none' }} />
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
            <div
              key={annotation.id}
              {...shared}
              className={`${shared.className} annotation-shape`}
              style={{ ...shared.style, width: `${annotation.w * 100}%`, height: `${annotation.h * 100}%`, borderColor: annotation.color, borderWidth: `${(annotation.strokeWidth || 2.5) * zoom / 100}px` }}
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
            </div>
          );
        }
        return (
          <div
            key={annotation.id}
            {...shared}
            className={`${shared.className} annotation-text ${annotation.type === 'signature' ? 'annotation-signature' : ''}`}
            style={{ ...shared.style, width: `${annotation.w * 100}%`, fontSize: `${(annotation.size || 22) * zoom / 100}px`, color: annotation.color }}
          >
            {annotation.text}
          </div>
        );
      })}

      {draft && draft.type === 'draw' && (
        <svg className="drawing-draft" viewBox="0 0 1000 1000" preserveAspectRatio="none">
          <path d={draftPath(draft.points)} fill="none" stroke={currentColor} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        </svg>
      )}
      {draft && draft.type !== 'draw' && (
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
  const [documentName, setDocumentName] = useState('Fieldnotes — a slower kind of living.pdf');
  const [pageIndex, setPageIndex] = useState(0);
  const [zoom, setZoom] = useState(82);
  const [pageSize, setPageSize] = useState({ width: 502, height: 649 });
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
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const fileInputRef = useRef(null);
  const canvasRef = useRef(null);
  const renderTaskRef = useRef(null);
  const toastTimerRef = useRef(null);
  const propertyEditSnapshotRef = useRef(null);

  const pageCount = pdfDocument?.numPages || 0;
  const selectedAnnotation = annotations.find((item) => item.id === selectedId) || null;
  const activeTool = TOOL_OPTIONS.find((item) => item.id === tool) || TOOL_OPTIONS[0];

  const showToast = useCallback((message) => {
    setToast(message);
    window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(''), 3200);
  }, []);

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

  useEffect(() => {
    if (!pdfDocument || !canvasRef.current) return undefined;
    let cancelled = false;
    let task;
    pdfDocument.getPage(pageIndex + 1).then((page) => {
      if (cancelled || !canvasRef.current) return;
      const viewport = page.getViewport({ scale: zoom / 100 });
      const ratio = window.devicePixelRatio || 1;
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d', { alpha: false });
      canvas.width = Math.max(1, Math.round(viewport.width * ratio));
      canvas.height = Math.max(1, Math.round(viewport.height * ratio));
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      setPageSize({ width: viewport.width, height: viewport.height });
      task = page.render({
        canvasContext: context,
        viewport,
        transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined,
      });
      renderTaskRef.current = task;
      return task.promise;
    }).catch((error) => {
      if (!cancelled && error?.name !== 'RenderingCancelledException') {
        console.error('PDF page render failed', error);
        showToast('This page could not be rendered. Try another PDF.');
      }
    });
    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
      renderTaskRef.current = null;
    };
  }, [pdfDocument, pageIndex, zoom, showToast]);

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
    updateAnnotation(selectedAnnotation.id, patch);
  };

  const finishPropertyEdit = () => {
    if (!propertyEditSnapshotRef.current) return;
    commitAnnotations(propertyEditSnapshotRef.current);
    propertyEditSnapshotRef.current = null;
  };

  const setAnnotationColor = (color) => {
    setCurrentColor(color);
    if (selectedAnnotation && selectedAnnotation.color !== color) {
      finishPropertyEdit();
      commitAnnotations(annotations);
      updateAnnotation(selectedAnnotation.id, { color });
    }
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
      await savePdfBytes(bytes, document.getPageCount() - 1);
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
      const signatureFont = await document.embedFont(StandardFonts.TimesRomanItalic);

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
          page.drawRectangle({
            x,
            y: height - top - boxHeight,
            width: boxWidth,
            height: boxHeight,
            borderColor: color,
            borderWidth: annotation.strokeWidth || 2.5,
          });
          return;
        }
        if (annotation.type === 'draw') {
          const points = annotation.points || [];
          for (let index = 1; index < points.length; index += 1) {
            const start = points[index - 1];
            const end = points[index];
            page.drawLine({
              start: { x: start.x * width, y: height - start.y * height },
              end: { x: end.x * width, y: height - end.y * height },
              thickness: annotation.strokeWidth || 2.5,
              color,
              opacity: 1,
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
        const font = annotation.type === 'signature' ? signatureFont : annotation.type === 'text' && annotation.bold ? bold : annotation.type === 'text' && annotation.italic ? italic : regular;
        drawWrappedText(page, annotation.text || '', {
          x,
          y: height - top - size,
          maxWidth: Math.max(size, boxWidth),
          font,
          size,
          lineHeight: size * 1.2,
          color,
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
      if (!editingText && ['v', 't', 'h', 'd', 'r'].includes(event.key.toLowerCase())) {
        const shortcutMap = { v: 'select', t: 'text', h: 'highlight', d: 'draw', r: 'shape' };
        setTool(shortcutMap[event.key.toLowerCase()]);
      }
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
                  onClick={() => { setPageIndex(index); setSelectedId(null); }}
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
                <button type="button" className="toolbar-icon-button" onClick={() => { setPageIndex((index) => Math.max(0, index - 1)); setSelectedId(null); }} disabled={pageIndex <= 0} aria-label="Previous page" title="Previous page">
                  <ChevronLeft size={16} />
                </button>
                <span className="page-number-display"><strong>{String(pageIndex + 1).padStart(2, '0')}</strong><span>/</span>{String(pageCount).padStart(2, '0')}</span>
                <button type="button" className="toolbar-icon-button" onClick={() => { setPageIndex((index) => Math.min(pageCount - 1, index + 1)); setSelectedId(null); }} disabled={pageIndex >= pageCount - 1} aria-label="Next page" title="Next page">
                  <ChevronRight size={16} />
                </button>
              </div>
              <span className="toolbar-divider" />
              <div className="active-tool-caption"><span className="active-tool-indicator" style={{ background: tool === 'select' ? '#7768d6' : currentColor }} /><span>{activeTool.label}</span><span className="tool-caption-hint">{tool === 'select' ? 'Click an item to select it' : 'Click or drag on the page'}</span></div>
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
            <div className="page-stage">
              {!pdfDocument ? (
                <div className="loading-document"><LoaderCircle className="spin" size={24} /><span>Preparing your workspace…</span></div>
              ) : (
                <div className="pdf-page-shell" style={{ width: pageSize.width, height: pageSize.height }}>
                  <canvas ref={canvasRef} className="pdf-canvas" />
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
                </div>
              )}
            </div>
            <div className="workspace-bottomline">
              <span><ShieldCheck size={13} /> Edits preview instantly</span>
              <span>Drop a PDF anywhere to open it</span>
            </div>
          </div>
          <div className="mobile-tool-dock" aria-label="PDF editing tools">
            {TOOL_OPTIONS.map(({ id, label, icon: Icon }) => (
              <button type="button" key={id} className={tool === id ? 'active' : ''} onClick={() => setTool(id)} aria-label={label} title={label}>
                <Icon size={17} />
              </button>
            ))}
            <button type="button" onClick={() => fileInputRef.current?.click()} aria-label="Open PDF" title="Open PDF"><Upload size={17} /></button>
          </div>
        </main>

        <aside className={`inspector-sidebar ${inspectorOpen ? 'inspector-open' : ''}`}>
          <div className="inspector-scroll">
            <div className="inspector-header"><div><span className="inspector-kicker">WORKSPACE</span><h2>{selectedAnnotation ? 'Properties' : 'Page details'}</h2></div><button type="button" className="close-inspector" onClick={() => setInspectorOpen(false)} aria-label="Close properties"><X size={16} /></button></div>

            {selectedAnnotation ? (
              <>
                <div className="selection-card">
                  <div className={`selection-icon selection-${selectedAnnotation.type}`}>
                    {selectedAnnotation.type === 'text' ? <Type size={17} /> : selectedAnnotation.type === 'highlight' ? <Highlighter size={17} /> : selectedAnnotation.type === 'whiteout' ? <Eraser size={17} /> : selectedAnnotation.type === 'draw' ? <Pencil size={17} /> : selectedAnnotation.type === 'shape' ? <Square size={17} /> : selectedAnnotation.type === 'signature' ? <PenTool size={17} /> : selectedAnnotation.type === 'eraser' ? <Trash2 size={17} /> : <MessageSquareText size={17} />}
                  </div>
                  <div><strong>{selectedAnnotation.type === 'note' ? 'Sticky note' : selectedAnnotation.type === 'text' ? 'Text box' : selectedAnnotation.type === 'signature' ? 'Signature' : selectedAnnotation.type === 'draw' ? 'Freehand mark' : selectedAnnotation.type === 'highlight' ? 'Highlight' : selectedAnnotation.type === 'whiteout' ? 'Content cover' : 'Rectangle'}</strong><span>Page {selectedAnnotation.pageIndex + 1}</span></div>
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
                    <input id="text-size" className="range-input" type="range" min="12" max="52" step="1" value={selectedAnnotation.size || 22} onChange={(event) => updateSelectedAnnotation({ size: Number(event.target.value) })} onBlur={finishPropertyEdit} />
                    <div className="range-scale"><span>Small</span><span>Large</span></div>
                  </div>
                )}

                {selectedAnnotation.type !== 'whiteout' && <Palette value={selectedAnnotation.color || currentColor} onChange={setAnnotationColor} label="INK COLOR" />}

                {selectedAnnotation.type === 'highlight' && (
                  <div className="property-field">
                    <div className="slider-heading"><label htmlFor="highlight-opacity">OPACITY</label><span>{Math.round((selectedAnnotation.opacity ?? 0.34) * 100)}%</span></div>
                    <input id="highlight-opacity" className="range-input" type="range" min="10" max="80" step="5" value={Math.round((selectedAnnotation.opacity ?? 0.34) * 100)} onChange={(event) => updateSelectedAnnotation({ opacity: Number(event.target.value) / 100 })} onBlur={finishPropertyEdit} />
                  </div>
                )}

                {['shape', 'draw'].includes(selectedAnnotation.type) && (
                  <div className="property-field">
                    <div className="slider-heading"><label htmlFor="line-weight">LINE WEIGHT</label><span>{selectedAnnotation.strokeWidth || 2.5} px</span></div>
                    <input id="line-weight" className="range-input" type="range" min="1" max="8" step="0.5" value={selectedAnnotation.strokeWidth || 2.5} onChange={(event) => updateSelectedAnnotation({ strokeWidth: Number(event.target.value) })} onBlur={finishPropertyEdit} />
                  </div>
                )}

                <div className="inspector-tip"><Info size={15} /><span>{selectedAnnotation.type === 'whiteout' ? 'This masks the original page visually. Add a text box on top to replace it in the downloaded copy.' : 'Drag the item on the page to reposition it. It will be included in your downloaded PDF.'}</span></div>
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
