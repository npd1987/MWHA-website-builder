import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { sampleSite } from '../../../packages/site-model/src/index.ts';
import { CpanelClient, CpanelError, createAccountToken } from '../src/cpanel.ts';
import { MARKER_FILE, PublishBlocked, publishSite } from '../src/publish.ts';
import { startMockCpanel } from './mock-cpanel.ts';
import type { MockServer } from './mock-cpanel.ts';

const reseller = { user: 'noahreseller', token: 'WHMTOKEN' };
let server: MockServer;

before(async () => {
  server = await startMockCpanel({ reseller, account: 'bob' });
});
after(() => server.close());
beforeEach(() => {
  server.files.set('public_html', new Map());
});

async function client() {
  const token = await createAccountToken({ baseUrl: server.url, ...reseller }, 'bob');
  return new CpanelClient({ baseUrl: server.url, user: 'bob', token });
}

const text = (dir: string, file: string) => Buffer.from(server.files.get(dir)!.get(file)!).toString('utf8');

test('a reseller token gets a temporary account token, then publishes into public_html', async () => {
  const site = sampleSite();
  const result = await publishSite(await client(), site, { dir: 'public_html' });
  const names = [...server.files.get('public_html')!.keys()].sort();
  assert.ok(names.includes('index.html'));
  assert.ok(names.includes('contact.html'));
  assert.ok(names.includes('site.css'));
  assert.ok(names.some((n) => n.startsWith('img-')));
  assert.ok(names.includes(MARKER_FILE));
  assert.match(text('public_html', 'index.html'), /Handmade ceramics/);
  const marker = JSON.parse(text('public_html', MARKER_FILE));
  assert.deepEqual([...marker.files].sort(), result.uploaded.sort());
});

test('refuses to overwrite a site the builder did not create, unless forced', async () => {
  server.files.get('public_html')!.set('index.html', new TextEncoder().encode('<h1>My old site</h1>'));
  const c = await client();
  await assert.rejects(publishSite(c, sampleSite(), { dir: 'public_html' }), (err: unknown) => {
    assert.ok(err instanceof PublishBlocked);
    assert.deepEqual(err.conflicts, ['index.html']);
    return true;
  });
  assert.equal(text('public_html', 'index.html'), '<h1>My old site</h1>');

  await publishSite(c, sampleSite(), { dir: 'public_html', force: true });
  assert.match(text('public_html', 'index.html'), /Handmade ceramics/);
});

test('publishing again over its own earlier publish needs no --force', async () => {
  const c = await client();
  const site = sampleSite();
  await publishSite(c, site, { dir: 'public_html' });
  site.pages[0].sections[0].blocks[0] = { ...site.pages[0].sections[0].blocks[0] };
  site.pages = site.pages.slice(0, 1); // remove the Contact page
  const result = await publishSite(c, site, { dir: 'public_html' });
  assert.deepEqual(result.stale, ['contact.html']);
  // Never deletes: the old page is still there, and still recorded as ours.
  assert.ok(server.files.get('public_html')!.has('contact.html'));
  assert.ok(JSON.parse(text('public_html', MARKER_FILE)).files.includes('contact.html'));
});

test('dry run uploads nothing', async () => {
  const before = server.uploadRequests;
  const lines: string[] = [];
  const result = await publishSite(await client(), sampleSite(), { dir: 'public_html', dryRun: true, log: (l) => lines.push(l) });
  assert.equal(server.uploadRequests, before);
  assert.equal(server.files.get('public_html')!.size, 0);
  assert.ok(result.dryRun);
  assert.ok(lines.some((l) => l.startsWith('Would upload')));
});

test('warns when a WordPress index.php would still win over index.html', async () => {
  const dir = server.files.get('public_html')!;
  dir.set('index.php', new Uint8Array());
  dir.set('wp-config.php', new Uint8Array());
  const lines: string[] = [];
  await publishSite(await client(), sampleSite(), { dir: 'public_html', dryRun: true, log: (l) => lines.push(l) });
  assert.ok(lines.some((l) => l.includes('index.php')));
  assert.ok(lines.some((l) => l.includes('WordPress')));
});

test('clear errors for a missing folder, an account you do not own, and a bad WHM token', async () => {
  await assert.rejects(publishSite(await client(), sampleSite(), { dir: 'public_html/nope' }), /Could not open the folder/);
  await assert.rejects(createAccountToken({ baseUrl: server.url, ...reseller }, 'someoneelse'), (err: unknown) => {
    assert.ok(err instanceof CpanelError);
    assert.match(err.message, /not owned/);
    return true;
  });
  await assert.rejects(createAccountToken({ baseUrl: server.url, user: reseller.user, token: 'wrong' }, 'bob'), /refused the login/);
});
