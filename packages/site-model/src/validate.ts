import type { Site } from './types.ts';

/**
 * Light structural check for site JSON loaded from a file or storage.
 * Returns a list of problems; an empty list means the site can be used.
 * Rendering still sanitises every value, so this is about clear errors, not safety.
 */
export function validateSite(value: unknown): string[] {
  const problems: string[] = [];
  const site = value as Partial<Site> | null;
  if (!site || typeof site !== 'object') return ['Site data is not an object.'];
  if (site.version !== 1) problems.push('Unsupported site version (expected 1).');
  if (typeof site.name !== 'string') problems.push('Site name is missing.');
  if (!site.theme || typeof site.theme !== 'object') problems.push('Theme is missing.');
  if (!Array.isArray(site.pages) || site.pages.length === 0) {
    problems.push('Site has no pages.');
    return problems;
  }
  const slugs = new Set<string>();
  site.pages.forEach((page, i) => {
    if (typeof page?.slug !== 'string') problems.push(`Page ${i + 1} has no slug.`);
    else if (page.slug !== '' && !/^[a-z0-9-]+$/.test(page.slug))
      problems.push(`Page "${page.title}" has an invalid address "${page.slug}" (use lowercase letters, numbers and dashes).`);
    else if (slugs.has(page.slug)) problems.push(`Two pages share the address "${page.slug || 'home'}".`);
    else slugs.add(page.slug);
    if (!Array.isArray(page?.sections)) problems.push(`Page "${page?.title}" has no sections list.`);
  });
  if (!slugs.has('')) problems.push('Site needs a home page (a page with an empty address).');
  return problems;
}
