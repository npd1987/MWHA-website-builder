/**
 * The site model: everything the editor saves and the publisher turns into
 * static HTML. Plain JSON, so it can live in a database, a file, or
 * localStorage without conversion.
 */

/** Desktop sections are a 24-column grid, like Squarespace's Fluid Engine. */
export const DESKTOP_COLUMNS = 24;
/** Mobile sections get their own 8-column grid and their own layout. */
export const MOBILE_COLUMNS = 8;
/** Row heights are fixed; column widths stretch with the page. */
export const DESKTOP_ROW_HEIGHT = 32;
export const MOBILE_ROW_HEIGHT = 28;
/** Screens narrower than this use the mobile layout. */
export const MOBILE_BREAKPOINT = 768;
/** Widest the grid gets on large screens. */
export const MAX_CONTENT_WIDTH = 1200;

export type Viewport = 'desktop' | 'mobile';
export type Align = 'left' | 'center' | 'right';

/** A block's place on the grid. All values are 1-based grid cells. */
export interface GridRect {
  col: number;
  row: number;
  colSpan: number;
  rowSpan: number;
}

export interface BlockLayout {
  desktop: GridRect;
  /** Missing until the customer edits the mobile view; generated until then. */
  mobile?: GridRect;
}

interface BlockBase {
  id: string;
  layout: BlockLayout;
  /** Stacking order inside the section; higher sits on top. */
  z: number;
}

export interface HeadingBlock extends BlockBase {
  type: 'heading';
  props: { text: string; level: 1 | 2 | 3; size: number; align: Align; color: string };
}

export interface TextBlock extends BlockBase {
  type: 'text';
  props: { text: string; size: number; align: Align; color: string };
}

export interface ImageBlock extends BlockBase {
  type: 'image';
  props: { src: string; alt: string; fit: 'cover' | 'contain'; radius: number };
}

export interface ButtonBlock extends BlockBase {
  type: 'button';
  props: { label: string; href: string; variant: 'solid' | 'outline'; align: Align };
}

export interface ShapeBlock extends BlockBase {
  type: 'shape';
  props: { color: string; radius: number };
}

export type Block = HeadingBlock | TextBlock | ImageBlock | ButtonBlock | ShapeBlock;
export type BlockType = Block['type'];

export interface Section {
  id: string;
  rows: { desktop: number; mobile?: number };
  background: string;
  blocks: Block[];
}

export interface Page {
  id: string;
  title: string;
  /** "" for the home page (index.html), otherwise the file name without .html. */
  slug: string;
  sections: Section[];
}

export interface Theme {
  headingFont: FontId;
  bodyFont: FontId;
  background: string;
  text: string;
  accent: string;
}

export interface Site {
  version: 1;
  name: string;
  theme: Theme;
  pages: Page[];
}

/** Fonts we offer. Google fonts are loaded from Google Fonts on the published site. */
export const FONTS = {
  inter: { label: 'Inter', css: "'Inter', system-ui, sans-serif", google: 'Inter:wght@400;600;700' },
  playfair: { label: 'Playfair Display', css: "'Playfair Display', Georgia, serif", google: 'Playfair+Display:wght@400;700' },
  dmserif: { label: 'DM Serif Display', css: "'DM Serif Display', Georgia, serif", google: 'DM+Serif+Display' },
  worksans: { label: 'Work Sans', css: "'Work Sans', system-ui, sans-serif", google: 'Work+Sans:wght@400;600;700' },
  system: { label: 'System', css: 'system-ui, -apple-system, Segoe UI, sans-serif', google: null },
  georgia: { label: 'Georgia', css: 'Georgia, serif', google: null },
} as const;

export type FontId = keyof typeof FONTS;
