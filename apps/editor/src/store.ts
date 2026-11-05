import { createContext, useContext } from 'react';
import {
  DEFAULT_SIZE,
  createBlock,
  materializeMobile,
  rectBottom,
  sectionLayout,
} from '@mwha/site-model';
import type { Block, BlockType, GridRect, Page, Section, Site, Viewport } from '@mwha/site-model';

export interface Selection {
  sectionId: string | null;
  blockId: string | null;
}

export interface EditorState {
  past: Site[];
  present: Site;
  future: Site[];
  /** Snapshot taken when a drag starts, so the whole drag is one undo step. */
  txn: Site | null;
  pageId: string;
  viewport: Viewport;
  selection: Selection;
}

type Recipe = (site: Site) => Site;

export type Action =
  | { type: 'change'; recipe: Recipe }
  | { type: 'begin' }
  | { type: 'preview'; recipe: Recipe }
  | { type: 'end' }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'load'; site: Site }
  | { type: 'select'; selection: Selection }
  | { type: 'viewport'; viewport: Viewport }
  | { type: 'page'; pageId: string };

const HISTORY_LIMIT = 100;

export function initState(site: Site): EditorState {
  return {
    past: [],
    present: site,
    future: [],
    txn: null,
    pageId: site.pages[0].id,
    viewport: 'desktop',
    selection: { sectionId: null, blockId: null },
  };
}

/** Drop a selection that points at things that no longer exist (after undo, delete, page switch). */
function fixSelection(state: EditorState): EditorState {
  const page = state.present.pages.find((p) => p.id === state.pageId) ?? state.present.pages[0];
  const pageId = page.id;
  const { sectionId, blockId } = state.selection;
  const section = page.sections.find((s) => s.id === sectionId);
  const block = section?.blocks.find((b) => b.id === blockId);
  if (pageId === state.pageId && (sectionId === null || section) && (blockId === null || block)) return state;
  return {
    ...state,
    pageId,
    selection: { sectionId: section ? section.id : null, blockId: block ? block.id : null },
  };
}

export function reducer(state: EditorState, action: Action): EditorState {
  switch (action.type) {
    case 'change': {
      const next = action.recipe(state.present);
      if (next === state.present) return state;
      return fixSelection({
        ...state,
        past: [...state.past, state.present].slice(-HISTORY_LIMIT),
        present: next,
        future: [],
      });
    }
    case 'begin':
      return { ...state, txn: state.present };
    case 'preview':
      return { ...state, present: action.recipe(state.present) };
    case 'end': {
      if (!state.txn) return state;
      if (state.txn === state.present || JSON.stringify(state.txn) === JSON.stringify(state.present)) {
        return { ...state, present: state.txn, txn: null };
      }
      return { ...state, past: [...state.past, state.txn].slice(-HISTORY_LIMIT), future: [], txn: null };
    }
    case 'undo': {
      const prev = state.past.at(-1);
      if (!prev) return state;
      return fixSelection({
        ...state,
        past: state.past.slice(0, -1),
        present: prev,
        future: [state.present, ...state.future],
      });
    }
    case 'redo': {
      const next = state.future[0];
      if (!next) return state;
      return fixSelection({ ...state, past: [...state.past, state.present], present: next, future: state.future.slice(1) });
    }
    case 'load':
      return initState(action.site);
    case 'select':
      return { ...state, selection: action.selection };
    case 'viewport':
      return { ...state, viewport: action.viewport };
    case 'page':
      return { ...state, pageId: action.pageId, selection: { sectionId: null, blockId: null } };
  }
}

export const EditorContext = createContext<{ state: EditorState; dispatch: (a: Action) => void } | null>(null);

export function useEditor() {
  const ctx = useContext(EditorContext);
  if (!ctx) throw new Error('useEditor outside EditorContext');
  return ctx;
}

// ---------------------------------------------------------------- recipes

export const currentPage = (state: EditorState): Page =>
  state.present.pages.find((p) => p.id === state.pageId) ?? state.present.pages[0];

export function mapPage(site: Site, pageId: string, fn: (p: Page) => Page): Site {
  return { ...site, pages: site.pages.map((p) => (p.id === pageId ? fn(p) : p)) };
}

export function mapSection(site: Site, pageId: string, sectionId: string, fn: (s: Section) => Section): Site {
  return mapPage(site, pageId, (p) => ({ ...p, sections: p.sections.map((s) => (s.id === sectionId ? fn(s) : s)) }));
}

export function mapBlock(
  site: Site,
  pageId: string,
  sectionId: string,
  blockId: string,
  fn: (b: Block) => Block,
): Site {
  return mapSection(site, pageId, sectionId, (s) => ({ ...s, blocks: s.blocks.map((b) => (b.id === blockId ? fn(b) : b)) }));
}

/** Change one prop of a block. Typed loosely on purpose; the inspector only offers valid fields. */
export function setProp(blockId: string, key: string, value: unknown) {
  return (b: Block): Block => (b.id === blockId ? ({ ...b, props: { ...b.props, [key]: value } } as Block) : b);
}

/** Put a block at a rect in one viewport and grow the section if it now pokes out the bottom. */
export function placeBlock(section: Section, blockId: string, viewport: Viewport, rect: GridRect): Section {
  const blocks = section.blocks.map((b) =>
    b.id === blockId ? ({ ...b, layout: { ...b.layout, [viewport]: rect } } as Block) : b,
  );
  const bottom = rectBottom(rect);
  const rows =
    viewport === 'desktop'
      ? { ...section.rows, desktop: Math.max(section.rows.desktop, bottom) }
      : { ...section.rows, mobile: Math.max(section.rows.mobile ?? 0, bottom) };
  return { ...section, blocks, rows };
}

/** Mobile edits freeze the generated mobile layout first, so other blocks don't move. */
export function prepareForViewport(section: Section, viewport: Viewport): Section {
  if (viewport === 'mobile' && section.blocks.some((b) => !b.layout.mobile)) return materializeMobile(section);
  return section;
}

export function addBlock(section: Section, type: BlockType, id: string): Section {
  const size = DEFAULT_SIZE[type];
  const desktop = sectionLayout(section, 'desktop');
  const lowest = Math.max(0, ...[...desktop.rects.values()].map(rectBottom));
  const z = Math.max(0, ...section.blocks.map((b) => b.z)) + 1;
  const block = { ...createBlock(type, { col: 3, row: lowest + 2, colSpan: size.colSpan, rowSpan: size.rowSpan }, z), id };
  // If the mobile layout has been customised, give the new block a spot at the bottom there too.
  if (section.blocks.some((b) => b.layout.mobile)) {
    const mobile = sectionLayout(section, 'mobile');
    const mLowest = Math.max(0, ...[...mobile.rects.values()].map(rectBottom));
    block.layout.mobile = { col: 1, row: mLowest + 2, colSpan: 8, rowSpan: Math.max(2, Math.round(size.rowSpan * 0.9)) };
  }
  let next = { ...section, blocks: [...section.blocks, block] };
  next = placeBlock(next, block.id, 'desktop', block.layout.desktop);
  if (block.layout.mobile) next = placeBlock(next, block.id, 'mobile', block.layout.mobile);
  return next;
}

export function duplicateBlock(section: Section, blockId: string, id: string): Section {
  const source = section.blocks.find((b) => b.id === blockId);
  if (!source) return section;
  const shift = (r: GridRect): GridRect => ({ ...r, row: r.row + 1, col: r.col });
  const copy = {
    ...structuredClone(source),
    id,
    z: Math.max(...section.blocks.map((b) => b.z)) + 1,
  } as Block;
  copy.layout = {
    desktop: shift(source.layout.desktop),
    ...(source.layout.mobile ? { mobile: shift(source.layout.mobile) } : {}),
  };
  let next = { ...section, blocks: [...section.blocks, copy] };
  next = placeBlock(next, copy.id, 'desktop', copy.layout.desktop);
  if (copy.layout.mobile) next = placeBlock(next, copy.id, 'mobile', copy.layout.mobile);
  return next;
}

export { createPage as newPage, newId } from '@mwha/site-model';

export function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'page'
  );
}
