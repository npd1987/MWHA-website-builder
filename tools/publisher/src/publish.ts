import { renderSite, validateSite } from '../../../packages/site-model/src/index.ts';
import type { OutputFile, Site } from '../../../packages/site-model/src/index.ts';
import type { CpanelClient } from './cpanel.ts';

/** Written next to the site so the next publish knows which files are ours. */
export const MARKER_FILE = 'mwha-builder.json';

export interface Marker {
  generator: 'mwha-website-builder';
  siteName: string;
  publishedAt: string;
  files: string[];
}

export interface PublishOptions {
  /** Folder inside the account's home, usually public_html. */
  dir: string;
  /** Overwrite files that this builder didn't create. */
  force?: boolean;
  /** Show what would happen without uploading. */
  dryRun?: boolean;
  log?: (line: string) => void;
}

export interface PublishResult {
  uploaded: string[];
  /** Files from an earlier publish that the new site no longer has (left in place for now). */
  stale: string[];
  dryRun: boolean;
}

export class PublishBlocked extends Error {
  readonly conflicts: string[];
  constructor(message: string, conflicts: string[]) {
    super(message);
    this.conflicts = conflicts;
  }
}

/** Keep each upload request well under typical PHP/cPanel upload limits. */
const BATCH_BYTES = 8 * 1024 * 1024;
const BATCH_FILES = 20;

const size = (f: OutputFile) => (typeof f.content === 'string' ? new TextEncoder().encode(f.content).length : f.content.length);

function batches(files: OutputFile[]): OutputFile[][] {
  const out: OutputFile[][] = [];
  let current: OutputFile[] = [];
  let bytes = 0;
  for (const f of files) {
    const s = size(f);
    if (current.length > 0 && (bytes + s > BATCH_BYTES || current.length >= BATCH_FILES)) {
      out.push(current);
      current = [];
      bytes = 0;
    }
    current.push(f);
    bytes += s;
  }
  if (current.length) out.push(current);
  return out;
}

async function readMarker(client: CpanelClient, dir: string, names: Set<string>): Promise<Marker | null> {
  if (!names.has(MARKER_FILE)) return null;
  try {
    const marker = JSON.parse(await client.getFileContent(dir, MARKER_FILE)) as Marker;
    return marker.generator === 'mwha-website-builder' && Array.isArray(marker.files) ? marker : null;
  } catch {
    return null;
  }
}

/**
 * Publish a site into a cPanel folder.
 *
 * Safety rules: never delete anything, and refuse to overwrite files this
 * builder didn't put there (an existing hand-made or WordPress site) unless
 * `force` is set.
 */
export async function publishSite(client: CpanelClient, site: Site, opts: PublishOptions): Promise<PublishResult> {
  const log = opts.log ?? (() => {});
  const problems = validateSite(site);
  if (problems.length) throw new Error(`The site file has problems:\n- ${problems.join('\n- ')}`);

  const files = renderSite(site);
  let existing;
  try {
    existing = await client.listFiles(opts.dir);
  } catch (err) {
    throw new Error(
      `Could not open the folder "${opts.dir}" on the account (${(err as Error).message}). ` +
        'Create it in cPanel File Manager first, or check the folder name.',
    );
  }
  const names = new Set(existing.map((e) => e.file));
  const marker = await readMarker(client, opts.dir, names);
  const ours = new Set(marker?.files ?? []);

  const conflicts = files.map((f) => f.path).filter((p) => names.has(p) && !ours.has(p));
  const warnings: string[] = [];
  for (const other of ['index.php', 'index.htm', 'default.html']) {
    if (names.has(other)) {
      warnings.push(`"${other}" is in this folder and the server may show it instead of the new index.html.`);
    }
  }
  if (names.has('wp-config.php')) warnings.push('This folder contains a WordPress site.');

  log(`Folder ${opts.dir}: ${existing.length} existing item(s)${marker ? `, last published ${marker.publishedAt}` : ''}.`);
  for (const w of warnings) log(`Warning: ${w}`);

  if (conflicts.length && !opts.force) {
    throw new PublishBlocked(
      `Publishing would overwrite ${conflicts.length} file(s) that this builder didn't create: ${conflicts.join(', ')}. ` +
        'Back them up first and run again with --force, or publish to an empty folder with --dir.',
      conflicts,
    );
  }

  const stale = [...ours].filter((p) => !files.some((f) => f.path === p));
  const plan = batches(files);
  log(`${opts.dryRun ? 'Would upload' : 'Uploading'} ${files.length} file(s) in ${plan.length} request(s): ${files.map((f) => f.path).join(', ')}`);
  if (conflicts.length) log(`Overwriting (forced): ${conflicts.join(', ')}`);
  if (stale.length) log(`Left in place from the last publish (no longer used): ${stale.join(', ')}`);

  if (!opts.dryRun) {
    for (const batch of plan) {
      await client.uploadFiles(
        opts.dir,
        batch.map((f) => ({ name: f.path, content: f.content })),
      );
    }
    const next: Marker = {
      generator: 'mwha-website-builder',
      siteName: site.name,
      publishedAt: new Date().toISOString(),
      files: [...new Set([...files.map((f) => f.path), ...stale])],
    };
    await client.uploadFiles(opts.dir, [{ name: MARKER_FILE, content: JSON.stringify(next, null, 2) }]);
    log('Done.');
  }

  return { uploaded: opts.dryRun ? [] : files.map((f) => f.path), stale, dryRun: Boolean(opts.dryRun) };
}
