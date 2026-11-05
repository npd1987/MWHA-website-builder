import type { Block, BlockType, GridRect, Page, Section, Site } from './types.ts';

export const newId = (): string => Math.random().toString(36).slice(2, 10);

const PLACEHOLDER_IMAGE =
  'data:image/svg+xml;base64,' +
  btoa(
    '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">' +
      '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#c9d6ff"/><stop offset="1" stop-color="#e2e2e2"/></linearGradient></defs>' +
      '<rect width="1200" height="800" fill="url(#g)"/>' +
      '<circle cx="860" cy="260" r="90" fill="#ffffff" fill-opacity="0.7"/>' +
      '<path d="M0 640 L320 380 L560 600 L760 460 L1200 760 L1200 800 L0 800 Z" fill="#8fa4d8" fill-opacity="0.6"/>' +
      '</svg>',
  );

/** A new block of a given type with sensible defaults, placed at `at`. */
export function createBlock(type: BlockType, at: GridRect, z = 1): Block {
  const base = { id: newId(), layout: { desktop: at }, z };
  switch (type) {
    case 'heading':
      return { ...base, type, props: { text: 'Your headline here', level: 2, size: 48, align: 'left', color: '' } };
    case 'text':
      return {
        ...base,
        type,
        props: { text: 'Write something about your business. Double-click to edit this text.', size: 18, align: 'left', color: '' },
      };
    case 'image':
      return { ...base, type, props: { src: PLACEHOLDER_IMAGE, alt: '', fit: 'cover', radius: 0 } };
    case 'button':
      return { ...base, type, props: { label: 'Learn more', href: '#', variant: 'solid', align: 'left' } };
    case 'shape':
      return { ...base, type, props: { color: '#e8ecf7', radius: 12 } };
  }
}

/** Default size for each block type when added from the palette (desktop cells). */
export const DEFAULT_SIZE: Record<BlockType, { colSpan: number; rowSpan: number }> = {
  heading: { colSpan: 14, rowSpan: 3 },
  text: { colSpan: 10, rowSpan: 4 },
  image: { colSpan: 10, rowSpan: 9 },
  button: { colSpan: 6, rowSpan: 2 },
  shape: { colSpan: 8, rowSpan: 6 },
};

export function createSection(background = 'transparent'): Section {
  return { id: newId(), rows: { desktop: 14 }, background, blocks: [] };
}

export function createPage(title: string, slug: string): Page {
  const section = createSection();
  section.blocks.push(createBlock('heading', { col: 3, row: 3, colSpan: 16, rowSpan: 3 }));
  return { id: newId(), title, slug, sections: [section] };
}

/** The starter template a new site begins with. */
export function sampleSite(): Site {
  const hero: Section = {
    id: newId(),
    rows: { desktop: 18 },
    background: 'transparent',
    blocks: [
      {
        id: newId(),
        type: 'heading',
        z: 2,
        layout: { desktop: { col: 2, row: 3, colSpan: 11, rowSpan: 7 } },
        props: { text: 'Handmade ceramics for everyday life', level: 1, size: 60, align: 'left', color: '' },
      },
      {
        id: newId(),
        type: 'text',
        z: 2,
        layout: { desktop: { col: 2, row: 11, colSpan: 9, rowSpan: 3 } },
        props: {
          text: 'Small-batch mugs, bowls and planters, made in our studio and shipped to your door.',
          size: 19,
          align: 'left',
          color: '',
        },
      },
      {
        id: newId(),
        type: 'button',
        z: 2,
        layout: { desktop: { col: 2, row: 15, colSpan: 6, rowSpan: 2 } },
        props: { label: 'Visit the shop', href: '#', variant: 'solid', align: 'left' },
      },
      {
        id: newId(),
        type: 'shape',
        z: 1,
        layout: { desktop: { col: 15, row: 2, colSpan: 9, rowSpan: 14 } },
        props: { color: '#e8ecf7', radius: 24 },
      },
      {
        id: newId(),
        type: 'image',
        z: 2,
        layout: { desktop: { col: 13, row: 4, colSpan: 10, rowSpan: 13 } },
        props: { src: PLACEHOLDER_IMAGE, alt: 'Ceramic mugs on a shelf', fit: 'cover', radius: 16 },
      },
    ],
  };
  const about: Section = {
    id: newId(),
    rows: { desktop: 12 },
    background: '#f4f1ec',
    blocks: [
      {
        id: newId(),
        type: 'heading',
        z: 1,
        layout: { desktop: { col: 2, row: 3, colSpan: 8, rowSpan: 2 } },
        props: { text: 'About the studio', level: 2, size: 36, align: 'left', color: '' },
      },
      {
        id: newId(),
        type: 'text',
        z: 1,
        layout: { desktop: { col: 11, row: 3, colSpan: 12, rowSpan: 6 } },
        props: {
          text: 'We started with one wheel in a garage. Ten years later we still throw every piece by hand, glaze in small batches, and test each one in our own kitchen.',
          size: 18,
          align: 'left',
          color: '',
        },
      },
    ],
  };
  return {
    version: 1,
    name: 'Clay & Co.',
    theme: { headingFont: 'playfair', bodyFont: 'inter', background: '#ffffff', text: '#1d1d1f', accent: '#c2532d' },
    pages: [
      { id: newId(), title: 'Home', slug: '', sections: [hero, about] },
      createPage('Contact', 'contact'),
    ],
  };
}
