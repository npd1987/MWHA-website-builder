import {
  DESKTOP_COLUMNS,
  DESKTOP_ROW_HEIGHT,
  MAX_CONTENT_WIDTH,
  MOBILE_COLUMNS,
  MOBILE_ROW_HEIGHT,
} from './types.ts';
import type { Block, GridRect, Section, Viewport } from './types.ts';

export type ResizeHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

export const columnsFor = (viewport: Viewport): number =>
  viewport === 'desktop' ? DESKTOP_COLUMNS : MOBILE_COLUMNS;

export const rowHeightFor = (viewport: Viewport): number =>
  viewport === 'desktop' ? DESKTOP_ROW_HEIGHT : MOBILE_ROW_HEIGHT;

const clampInt = (v: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, Math.round(v)));

/** Keep a rect inside the grid's columns. Rows are unbounded (the section grows). */
export function clampRect(rect: GridRect, columns: number): GridRect {
  const colSpan = clampInt(rect.colSpan, 1, columns);
  return {
    colSpan,
    col: clampInt(rect.col, 1, columns - colSpan + 1),
    rowSpan: Math.max(1, Math.round(rect.rowSpan)),
    row: Math.max(1, Math.round(rect.row)),
  };
}

/** Move a rect by whole cells, snapping to the grid. */
export function moveRect(start: GridRect, dCol: number, dRow: number, columns: number): GridRect {
  return clampRect({ ...start, col: start.col + dCol, row: start.row + dRow }, columns);
}

/** Resize a rect from one of its edges or corners by whole cells. */
export function resizeRect(
  start: GridRect,
  handle: ResizeHandle,
  dCol: number,
  dRow: number,
  columns: number,
): GridRect {
  let { col, row, colSpan, rowSpan } = start;
  const right = col + colSpan - 1;
  const bottom = row + rowSpan - 1;

  if (handle.includes('e')) {
    colSpan = clampInt(start.colSpan + dCol, 1, columns - col + 1);
  }
  if (handle.includes('w')) {
    col = clampInt(start.col + dCol, 1, right);
    colSpan = right - col + 1;
  }
  if (handle.includes('s')) {
    rowSpan = Math.max(1, start.rowSpan + dRow);
  }
  if (handle.includes('n')) {
    row = clampInt(start.row + dRow, 1, bottom);
    rowSpan = bottom - row + 1;
  }
  return { col, row, colSpan, rowSpan };
}

export const overlaps = (a: GridRect, b: GridRect): boolean =>
  a.col < b.col + b.colSpan && b.col < a.col + a.colSpan && a.row < b.row + b.rowSpan && b.row < a.row + a.rowSpan;

export const rectBottom = (r: GridRect): number => r.row + r.rowSpan - 1;

/**
 * Generate a mobile layout from the desktop one: blocks stacked full width in
 * reading order (top to bottom, left to right), with heights scaled so images
 * keep their shape and text gets room to wrap.
 */
export function autoMobileRects(section: Section): Map<string, GridRect> {
  const desktopWidth = MAX_CONTENT_WIDTH;
  const mobileWidth = 390 - 2 * 16;
  // A shape sitting behind another block (a backdrop) follows that block on mobile instead of taking its own row.
  const backdropOf = new Map<string, string>();
  for (const shape of section.blocks) {
    if (shape.type !== 'shape') continue;
    const front = section.blocks.find(
      (b) => b.type !== 'shape' && b.z > shape.z && overlaps(b.layout.desktop, shape.layout.desktop),
    );
    if (front) backdropOf.set(shape.id, front.id);
  }
  const ordered = section.blocks.filter((b) => !backdropOf.has(b.id)).sort(
    (a, b) => a.layout.desktop.row - b.layout.desktop.row || a.layout.desktop.col - b.layout.desktop.col,
  );
  const rects = new Map<string, GridRect>();
  let row = 2;
  for (const block of ordered) {
    const d = block.layout.desktop;
    const widthPx = (d.colSpan / DESKTOP_COLUMNS) * desktopWidth;
    const heightPx = d.rowSpan * DESKTOP_ROW_HEIGHT;
    let mobileHeightPx: number;
    if (block.type === 'image' || block.type === 'shape') {
      mobileHeightPx = heightPx * (mobileWidth / widthPx);
    } else if (block.type === 'button') {
      mobileHeightPx = heightPx;
    } else {
      // A narrower column means more lines, but mobile type is also smaller
      // (see the mobile CSS: headings x0.62, text x0.94), which offsets it.
      const fontScale = block.type === 'heading' ? 0.62 : 0.94;
      mobileHeightPx = heightPx * Math.min(2, Math.max(0.6, (widthPx / mobileWidth) * fontScale));
    }
    const rowSpan = Math.max(1, Math.ceil(mobileHeightPx / MOBILE_ROW_HEIGHT));
    rects.set(block.id, { col: 1, row, colSpan: MOBILE_COLUMNS, rowSpan });
    row += rowSpan + 1;
  }
  for (const [shapeId, frontId] of backdropOf) rects.set(shapeId, { ...rects.get(frontId)! });
  return rects;
}

/** The rect a block uses in a viewport, falling back to the generated mobile layout. */
export function rectFor(block: Block, viewport: Viewport, auto?: Map<string, GridRect>): GridRect {
  if (viewport === 'desktop') return block.layout.desktop;
  if (block.layout.mobile) return block.layout.mobile;
  return auto?.get(block.id) ?? { col: 1, row: 1, colSpan: MOBILE_COLUMNS, rowSpan: block.layout.desktop.rowSpan };
}

/** Every block's rect for a viewport, plus how many rows the section needs. */
export function sectionLayout(section: Section, viewport: Viewport): { rects: Map<string, GridRect>; rows: number } {
  const needsAuto = viewport === 'mobile' && section.blocks.some((b) => !b.layout.mobile);
  const auto = needsAuto ? autoMobileRects(section) : undefined;
  const rects = new Map<string, GridRect>();
  let lowest = 0;
  for (const block of section.blocks) {
    const r = rectFor(block, viewport, auto);
    rects.set(block.id, r);
    lowest = Math.max(lowest, rectBottom(r));
  }
  const stored = viewport === 'desktop' ? section.rows.desktop : section.rows.mobile;
  // Generated layouts always get one empty row of breathing room at the bottom.
  const rows = Math.max(stored ?? 0, lowest + (stored === undefined ? 1 : 0), 4);
  return { rects, rows };
}

/**
 * Freeze the generated mobile layout into the section so editing one mobile
 * block doesn't make the others jump around.
 */
export function materializeMobile(section: Section): Section {
  const { rects, rows } = sectionLayout(section, 'mobile');
  return {
    ...section,
    rows: { ...section.rows, mobile: rows },
    blocks: section.blocks.map((b) =>
      b.layout.mobile ? b : { ...b, layout: { ...b.layout, mobile: rects.get(b.id)! } },
    ) as Block[],
  };
}
