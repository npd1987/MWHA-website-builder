#!/usr/bin/env node
/**
 * Prototype command-line publisher. Usage:
 *
 *   npm run site -- build   --site site.json [--out dist]
 *   npm run site -- check   [--dir public_html]
 *   npm run site -- publish --site site.json [--dir public_html] [--dry-run] [--force]
 *
 * Credentials come from environment variables (see .env.example). Put them in
 * a .env file and run with:  node --env-file=.env tools/publisher/src/cli.ts …
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { renderSite, validateSite } from '../../../packages/site-model/src/index.ts';
import type { Site } from '../../../packages/site-model/src/index.ts';
import { CpanelClient, CpanelError, createAccountToken } from './cpanel.ts';
import { MARKER_FILE, PublishBlocked, publishSite } from './publish.ts';

const HELP = `MWHA website builder publisher (prototype)

Commands:
  build    Turn a saved site (site.json from the editor) into HTML files on this computer
  check    Test the cPanel login and look at the target folder
  publish  Upload the site into the cPanel account

Options:
  --site <file>   Saved site from the editor's "Save file" button
  --out <folder>  Where "build" writes files (default: dist)
  --dir <folder>  Folder in the cPanel account (default: public_html)
  --dry-run       Show what publish would do without uploading
  --force         Allow overwriting files this builder didn't create

Environment:
  CPANEL_HOST     Server name, e.g. server123.hosting.com
  CPANEL_USER     The customer's cPanel user name
  and either
    CPANEL_TOKEN  A cPanel API token for that account
  or (reseller)
    WHM_USER      Your reseller WHM user name
    WHM_TOKEN     A WHM API token from your reseller account
                  (a 1-hour cPanel token is created for the account on each run)
`;

async function connect(): Promise<CpanelClient> {
  const host = process.env.CPANEL_HOST;
  const user = process.env.CPANEL_USER;
  if (!user || (!host && !process.env.CPANEL_URL)) {
    throw new Error('Set CPANEL_HOST and CPANEL_USER (see --help).');
  }
  const baseUrl = process.env.CPANEL_URL ?? `https://${host}:2083`;
  let token = process.env.CPANEL_TOKEN;
  if (!token) {
    const whmUser = process.env.WHM_USER;
    const whmToken = process.env.WHM_TOKEN;
    if (!whmUser || !whmToken) throw new Error('Set CPANEL_TOKEN, or WHM_USER and WHM_TOKEN (see --help).');
    const whmUrl = process.env.WHM_URL ?? `https://${host}:2087`;
    console.log(`Requesting a temporary API token for ${user} from WHM…`);
    token = await createAccountToken({ baseUrl: whmUrl, user: whmUser, token: whmToken }, user);
  }
  return new CpanelClient({ baseUrl, user, token });
}

async function loadSite(path: string | undefined): Promise<Site> {
  if (!path) throw new Error('Pass the saved site with --site site.json');
  const site = JSON.parse(await readFile(path, 'utf8')) as Site;
  const problems = validateSite(site);
  if (problems.length) throw new Error(`${path} has problems:\n- ${problems.join('\n- ')}`);
  return site;
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      site: { type: 'string' },
      out: { type: 'string', default: 'dist' },
      dir: { type: 'string', default: 'public_html' },
      'dry-run': { type: 'boolean', default: false },
      force: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
  const command = positionals[0];
  if (values.help || !command) {
    console.log(HELP);
    return;
  }

  if (command === 'build') {
    const site = await loadSite(values.site);
    const out = resolve(values.out!);
    await mkdir(out, { recursive: true });
    for (const f of renderSite(site)) await writeFile(join(out, f.path), f.content);
    console.log(`Wrote the site to ${out}. Open index.html in a browser to look at it.`);
    return;
  }

  if (command === 'check') {
    const client = await connect();
    const entries = await client.listFiles(values.dir!);
    console.log(`Logged in as ${client.auth.user}. ${values.dir} has ${entries.length} item(s):`);
    for (const e of entries.slice(0, 30)) console.log(`  ${e.type === 'dir' ? '[folder] ' : ''}${e.file}`);
    if (entries.length > 30) console.log(`  …and ${entries.length - 30} more`);
    const ours = entries.some((e) => e.file === MARKER_FILE);
    console.log(ours ? 'This folder was published by the builder before.' : 'The builder has not published to this folder yet.');
    return;
  }

  if (command === 'publish') {
    const site = await loadSite(values.site);
    const client = await connect();
    await publishSite(client, site, {
      dir: values.dir!,
      force: values.force,
      dryRun: values['dry-run'],
      log: (line) => console.log(line),
    });
    return;
  }

  throw new Error(`Unknown command "${command}". Run with --help.`);
}

main().catch((err) => {
  if (err instanceof PublishBlocked || err instanceof CpanelError) console.error(`\nStopped: ${err.message}`);
  else console.error(`\nError: ${(err as Error).message}`);
  process.exit(1);
});
