import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  autoMobileRects,
  clampRect,
  createBlock,
  materializeMobile,
  moveRect,
  renderPageHtml,
  renderSite,
  resizeRect,
  safeColor,
  safeUrl,
  sampleSite,
  sectionLayout,
  validateSite,
} from '../src/index.ts';
import type { Section } from '../src/index.ts';

test('moving snaps to whole cells and stays inside the 24 columns', () => {
  const start = { col: 20, row: 2, colSpan: 4, rowSpan: 2 };
  assert.deepEqual(moveRect(start, 5, 0, 24), { col: 21, row: 2, colSpan: 4, rowSpan: 2 });
  assert.deepEqual(moveRect(start, -30, -5, 24), { col: 1, row: 1, colSpan: 4, rowSpan: 2 });
  assert.deepEqual(moveRect(start, 0, 10, 24).row, 12);
});

test('resizing from each side keeps the opposite edge fixed', () => {
  const start = { col: 5, row: 5, colSpan: 6, rowSpan: 4 };
  assert.deepEqual(resizeRect(start, 'e', 3, 0, 24), { col: 5, row: 5, colSpan: 9, rowSpan: 4 });
  assert.deepEqual(resizeRect(start, 'w', -2, 0, 24), { col: 3, row: 5, colSpan: 8, rowSpan: 4 });
  assert.deepEqual(resizeRect(start, 'n', 0, 2, 24), { col: 5, row: 7, colSpan: 6, rowSpan: 2 });
  assert.deepEqual(resizeRect(start, 'se', 100, 3, 24), { col: 5, row: 5, colSpan: 20, rowSpan: 7 });
  // Never collapses below one cell.
  assert.deepEqual(resizeRect(start, 'nw', 50, 50, 24), { col: 10, row: 8, colSpan: 1, rowSpan: 1 });
});

test('clampRect fixes rects that spill off the grid', () => {
  assert.deepEqual(clampRect({ col: 7, row: 0, colSpan: 12, rowSpan: 0 }, 8), { col: 1, row: 1, colSpan: 8, rowSpan: 1 });
});

test('auto mobile layout stacks blocks full width in reading order', () => {
  const section: Section = {
    id: 's',
    rows: { desktop: 10 },
    background: '',
    blocks: [
      createBlock('image', { col: 13, row: 2, colSpan: 12, rowSpan: 8 }),
      createBlock('heading', { col: 1, row: 2, colSpan: 12, rowSpan: 2 }),
      createBlock('text', { col: 1, row: 5, colSpan: 12, rowSpan: 3 }),
    ],
  };
  const [image, heading, text] = section.blocks;
  const rects = autoMobileRects(section);
  const order = [...rects.entries()].sort((a, b) => a[1].row - b[1].row).map(([id]) => id);
  // Same top row: left (heading) comes before right (image); text is lower so it's last.
  assert.deepEqual(order, [heading.id, image.id, text.id]);
  for (const r of rects.values()) assert.equal(r.colSpan, 8);
  // No overlaps.
  const sorted = [...rects.values()].sort((a, b) => a.row - b.row);
  for (let i = 1; i < sorted.length; i++) {
    assert.ok(sorted[i].row > sorted[i - 1].row + sorted[i - 1].rowSpan - 1);
  }
});

test('a shape behind another block follows it on mobile instead of taking its own row', () => {
  const section: Section = {
    id: 's',
    rows: { desktop: 10 },
    background: '',
    blocks: [
      { ...createBlock('shape', { col: 13, row: 1, colSpan: 10, rowSpan: 10 }), z: 1 },
      { ...createBlock('image', { col: 14, row: 2, colSpan: 8, rowSpan: 8 }), z: 2 },
    ],
  };
  const rects = autoMobileRects(section);
  assert.deepEqual(rects.get(section.blocks[0].id), rects.get(section.blocks[1].id));
});

test('materializeMobile freezes generated positions and keeps edited ones', () => {
  const site = sampleSite();
  const section = site.pages[0].sections[0];
  section.blocks[0].layout.mobile = { col: 2, row: 30, colSpan: 4, rowSpan: 2 };
  const frozen = materializeMobile(section);
  assert.ok(frozen.blocks.every((b) => b.layout.mobile));
  assert.deepEqual(frozen.blocks[0].layout.mobile, { col: 2, row: 30, colSpan: 4, rowSpan: 2 });
  assert.equal(frozen.rows.mobile, sectionLayout(section, 'mobile').rows);
});

test('sections grow to fit their lowest block', () => {
  const section: Section = {
    id: 's',
    rows: { desktop: 6 },
    background: '',
    blocks: [createBlock('text', { col: 1, row: 8, colSpan: 4, rowSpan: 3 })],
  };
  assert.equal(sectionLayout(section, 'desktop').rows, 10);
});

test('rendered pages escape text and block unsafe links and colours', () => {
  const site = sampleSite();
  const block = createBlock('button', { col: 1, row: 1, colSpan: 4, rowSpan: 2 });
  if (block.type !== 'button') throw new Error('expected button');
  block.props.label = '<script>alert(1)</script>';
  block.props.href = 'javascript:alert(1)';
  site.pages[0].sections[0].blocks.push(block);
  site.pages[0].sections[0].background = 'red;}</style><script>';
  const html = renderPageHtml(site, site.pages[0]);
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('javascript:'));
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.equal(safeColor('#abc', 'x'), '#abc');
  assert.equal(safeColor('url(evil)', 'x'), 'x');
  assert.equal(safeUrl('mailto:hi@example.com'), 'mailto:hi@example.com');
  assert.equal(safeUrl('about.html'), 'about.html');
  assert.equal(safeUrl('data:text/html,hi'), '#');
});

test('renderSite writes one file per page, a stylesheet and extracted images', () => {
  const site = sampleSite();
  const files = renderSite(site);
  const names = files.map((f) => f.path);
  assert.ok(names.includes('index.html'));
  assert.ok(names.includes('contact.html'));
  assert.ok(names.includes('site.css'));
  const image = files.find((f) => f.path.startsWith('img-'));
  assert.ok(image, 'the uploaded placeholder image becomes its own file');
  assert.ok(image.content instanceof Uint8Array);
  const index = files.find((f) => f.path === 'index.html')!.content as string;
  assert.ok(index.includes(`src="${image.path}"`));
  assert.ok(!index.includes('data:image'));
  assert.ok(index.includes('@media (max-width:767px)'));
  assert.ok(index.includes('href="contact.html"'));
});

test('validateSite catches broken site files', () => {
  assert.deepEqual(validateSite(sampleSite()), []);
  assert.ok(validateSite(null).length > 0);
  const site = sampleSite();
  site.pages[1].slug = '';
  assert.ok(validateSite(site).some((p) => p.includes('share the address')));
  site.pages[1].slug = '../etc';
  assert.ok(validateSite(site).some((p) => p.includes('invalid address')));
});
