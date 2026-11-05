/**
 * Turns a Site into static files: one HTML file per page, a shared stylesheet,
 * and any uploaded images. The output needs no PHP or database, so it runs on
 * every cPanel plan.
 */
import {
  DESKTOP_COLUMNS,
  DESKTOP_ROW_HEIGHT,
  FONTS,
  MAX_CONTENT_WIDTH,
  MOBILE_BREAKPOINT,
  MOBILE_COLUMNS,
  MOBILE_ROW_HEIGHT,
} from './types.ts';
import type { Block, GridRect, Page, Section, Site, Theme } from './types.ts';
import { sectionLayout } from './layout.ts';

// ---------------------------------------------------------------- safety

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const COLOR_RE = /^(#[0-9a-fA-F]{3,8}|rgba?\(\s*[\d.]+%?\s*,\s*[\d.]+%?\s*,\s*[\d.]+%?\s*(,\s*[\d.]+\s*)?\)|transparent)$/;

/** Only allow plain colour values into CSS, so a saved site can't inject styles. */
export function safeColor(value: string, fallback: string): string {
  return COLOR_RE.test(value.trim()) ? value.trim() : fallback;
}

/** Allow web, email, phone, page-relative and same-page links; block javascript: and friends. */
export function safeUrl(value: string): string {
  const v = value.trim();
  if (v === '') return '#';
  if (/^(https?:|mailto:|tel:)/i.test(v)) return v;
  if (/^[a-z][a-z0-9+.-]*:/i.test(v)) return '#';
  return v;
}

/** Image sources: web URLs, relative files, or uploaded images as data URLs. */
export function safeImageSrc(value: string): string {
  const v = value.trim();
  if (/^data:image\/(png|jpeg|gif|webp|svg\+xml|avif);base64,/i.test(v)) return v;
  if (/^https?:/i.test(v)) return v;
  if (/^[a-z][a-z0-9+.-]*:/i.test(v)) return '';
  return v;
}

const safeId = (id: string): string => id.replace(/[^a-zA-Z0-9_-]/g, '');
const num = (v: number, lo: number, hi: number, fallback: number): number =>
  Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;

export const pageFileName = (page: Page): string =>
  page.slug === '' ? 'index.html' : `${page.slug.replace(/[^a-z0-9-]/gi, '').toLowerCase() || 'page'}.html`;

// ---------------------------------------------------------------- CSS

const fontCss = (id: Theme['headingFont']): string => (FONTS[id] ?? FONTS.system).css;

export function googleFontsHref(theme: Theme): string | null {
  const families = [...new Set([theme.headingFont, theme.bodyFont])]
    .map((id) => FONTS[id]?.google)
    .filter((g): g is NonNullable<typeof g> => Boolean(g));
  if (families.length === 0) return null;
  return `https://fonts.googleapis.com/css2?${families.map((f) => `family=${f}`).join('&')}&display=swap`;
}

/** Mobile rules, written once for the published site (media query) and once for the editor's mobile preview. */
function mobileRules(scope: string): string {
  return `
${scope} .mw-grid { grid-template-columns: repeat(${MOBILE_COLUMNS}, minmax(0, 1fr)); grid-auto-rows: ${MOBILE_ROW_HEIGHT}px; padding: 0 16px; }
${scope} .mw-heading { font-size: calc(var(--fs) * 0.62); }
${scope} .mw-text { font-size: max(15px, calc(var(--fs) * 0.94)); }
${scope} .mw-header-inner { padding: 16px; }`;
}

/** Styles shared by the published site and the editor canvas, so what you see is what you publish. */
export function baseCss(theme: Theme): string {
  const bg = safeColor(theme.background, '#ffffff');
  const text = safeColor(theme.text, '#1a1a1a');
  const accent = safeColor(theme.accent, '#1f5eff');
  return `
.mw-site { --mw-bg: ${bg}; --mw-text: ${text}; --mw-accent: ${accent}; background: var(--mw-bg); color: var(--mw-text); font-family: ${fontCss(theme.bodyFont)}; margin: 0; -webkit-font-smoothing: antialiased; }
.mw-site *, .mw-site *::before, .mw-site *::after { box-sizing: border-box; }
.mw-header-inner { max-width: ${MAX_CONTENT_WIDTH + 48}px; margin: 0 auto; padding: 20px 24px; display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.mw-logo { font-family: ${fontCss(theme.headingFont)}; font-size: 22px; font-weight: 700; color: inherit; text-decoration: none; }
.mw-nav { display: flex; gap: 20px; flex-wrap: wrap; }
.mw-nav a { color: inherit; text-decoration: none; font-size: 15px; opacity: 0.8; }
.mw-nav a[aria-current="page"] { opacity: 1; font-weight: 600; }
.mw-section { position: relative; }
.mw-grid { max-width: ${MAX_CONTENT_WIDTH + 48}px; margin: 0 auto; padding: 0 24px; display: grid; grid-template-columns: repeat(${DESKTOP_COLUMNS}, minmax(0, 1fr)); grid-auto-rows: ${DESKTOP_ROW_HEIGHT}px; }
.mw-block { position: relative; min-width: 0; min-height: 0; }
.mw-heading { margin: 0; font-family: ${fontCss(theme.headingFont)}; font-size: var(--fs); line-height: 1.12; font-weight: 700; overflow-wrap: anywhere; }
.mw-text { margin: 0; font-size: var(--fs); line-height: 1.6; white-space: pre-wrap; overflow-wrap: anywhere; }
.mw-image { display: block; width: 100%; height: 100%; }
.mw-button-wrap { display: flex; align-items: center; height: 100%; }
.mw-button { display: inline-block; padding: 12px 28px; border-radius: 999px; font-weight: 600; font-size: 15px; text-decoration: none; border: 2px solid var(--mw-accent); white-space: nowrap; }
.mw-button.solid { background: var(--mw-accent); color: #fff; }
.mw-button.outline { background: transparent; color: var(--mw-accent); }
.mw-shape { width: 100%; height: 100%; }
@media (max-width: ${MOBILE_BREAKPOINT - 1}px) {${mobileRules('')}
}
${mobileRules('.mw-mobile')}
`;
}

// ---------------------------------------------------------------- HTML

const justify = { left: 'flex-start', center: 'center', right: 'flex-end' } as const;

/** The inside of one block, as static HTML. The editor renders the same markup in React. */
export function blockInnerHtml(block: Block, resolveSrc: (src: string) => string = (s) => s): string {
  switch (block.type) {
    case 'heading': {
      const p = block.props;
      const level = [1, 2, 3].includes(p.level) ? p.level : 2;
      return `<h${level} class="mw-heading" style="--fs:${num(p.size, 12, 160, 48)}px;text-align:${p.align};color:${safeColor(p.color, 'inherit')}">${escapeHtml(p.text)}</h${level}>`;
    }
    case 'text': {
      const p = block.props;
      return `<p class="mw-text" style="--fs:${num(p.size, 10, 64, 17)}px;text-align:${p.align};color:${safeColor(p.color, 'inherit')}">${escapeHtml(p.text)}</p>`;
    }
    case 'image': {
      const p = block.props;
      const src = safeImageSrc(p.src);
      if (!src) return '';
      return `<img class="mw-image" src="${escapeHtml(resolveSrc(src))}" alt="${escapeHtml(p.alt)}" loading="lazy" style="object-fit:${p.fit === 'contain' ? 'contain' : 'cover'};border-radius:${num(p.radius, 0, 999, 0)}px">`;
    }
    case 'button': {
      const p = block.props;
      return `<div class="mw-button-wrap" style="justify-content:${justify[p.align] ?? 'flex-start'}"><a class="mw-button ${p.variant === 'outline' ? 'outline' : 'solid'}" href="${escapeHtml(safeUrl(p.href))}">${escapeHtml(p.label)}</a></div>`;
    }
    case 'shape': {
      const p = block.props;
      return `<div class="mw-shape" style="background:${safeColor(p.color, '#e5e5e5')};border-radius:${num(p.radius, 0, 999, 0)}px"></div>`;
    }
  }
}

export function headerHtml(site: Site, current: Page): string {
  const links =
    site.pages.length > 1
      ? `<nav class="mw-nav">${site.pages
          .map(
            (p) =>
              `<a href="${pageFileName(p)}"${p.id === current.id ? ' aria-current="page"' : ''}>${escapeHtml(p.title)}</a>`,
          )
          .join('')}</nav>`
      : '';
  return `<header class="mw-header"><div class="mw-header-inner"><a class="mw-logo" href="index.html">${escapeHtml(site.name)}</a>${links}</div></header>`;
}

const placement = (r: GridRect): string =>
  `grid-column:${r.col} / span ${r.colSpan};grid-row:${r.row} / span ${r.rowSpan}`;

function sectionHtml(section: Section, resolveSrc: (src: string) => string): { html: string; css: string } {
  const sid = safeId(section.id);
  const desktop = sectionLayout(section, 'desktop');
  const mobile = sectionLayout(section, 'mobile');
  let css = `.s-${sid} .mw-grid{grid-template-rows:repeat(${desktop.rows},${DESKTOP_ROW_HEIGHT}px)}\n`;
  let mobileCss = `.s-${sid} .mw-grid{grid-template-rows:repeat(${mobile.rows},${MOBILE_ROW_HEIGHT}px)}\n`;
  const blocks = section.blocks.map((block) => {
    const bid = safeId(block.id);
    css += `.b-${bid}{${placement(desktop.rects.get(block.id)!)};z-index:${Math.round(block.z) || 1}}\n`;
    mobileCss += `.b-${bid}{${placement(mobile.rects.get(block.id)!)}}\n`;
    return `<div class="mw-block b-${bid}">${blockInnerHtml(block, resolveSrc)}</div>`;
  });
  const html = `<section class="mw-section s-${sid}" style="background:${safeColor(section.background, 'transparent')}"><div class="mw-grid">${blocks.join('')}</div></section>`;
  css += `@media (max-width:${MOBILE_BREAKPOINT - 1}px){\n${mobileCss}}\n`;
  return { html, css };
}

export interface RenderOptions {
  /** Inline the stylesheet instead of linking site.css (used for the editor's preview). */
  inlineCss?: boolean;
  resolveSrc?: (src: string) => string;
}

export function renderPageHtml(site: Site, page: Page, opts: RenderOptions = {}): string {
  const resolveSrc = opts.resolveSrc ?? ((s: string) => s);
  const parts = page.sections.map((s) => sectionHtml(s, resolveSrc));
  const fonts = googleFontsHref(site.theme);
  const title = page.slug === '' ? site.name : `${page.title} | ${site.name}`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="MWHA Website Builder">
<title>${escapeHtml(title)}</title>
${fonts ? `<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n<link rel="stylesheet" href="${escapeHtml(fonts)}">\n` : ''}${opts.inlineCss ? `<style>${baseCss(site.theme)}</style>` : '<link rel="stylesheet" href="site.css">'}
<style>
${parts.map((p) => p.css).join('')}</style>
</head>
<body class="mw-site">
${headerHtml(site, page)}
<main>
${parts.map((p) => p.html).join('\n')}
</main>
</body>
</html>
`;
}

// ---------------------------------------------------------------- whole site

export interface OutputFile {
  path: string;
  content: string | Uint8Array;
}

const EXT: Record<string, string> = {
  png: 'png',
  jpeg: 'jpg',
  gif: 'gif',
  webp: 'webp',
  'svg+xml': 'svg',
  avif: 'avif',
};

function hash(value: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function decodeBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * All files for the published site, flat in one folder: pages, site.css and
 * uploaded images pulled out of the saved data into real files.
 */
export function renderSite(site: Site): OutputFile[] {
  const images = new Map<string, OutputFile>();
  const resolveSrc = (src: string): string => {
    const m = /^data:image\/([a-z+]+);base64,(.*)$/i.exec(src);
    if (!m) return src;
    const ext = EXT[m[1].toLowerCase()] ?? 'bin';
    const path = `img-${hash(m[2])}.${ext}`;
    if (!images.has(path)) images.set(path, { path, content: decodeBase64(m[2]) });
    return path;
  };
  const pages = site.pages.map((page) => ({
    path: pageFileName(page),
    content: renderPageHtml(site, page, { resolveSrc }),
  }));
  return [...pages, { path: 'site.css', content: baseCss(site.theme) }, ...images.values()];
}
