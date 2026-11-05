/**
 * A tiny fake cPanel/WHM server for tests. It speaks just enough of the real
 * API shapes (UAPI /execute/Fileman/*, WHM /json-api/cpanel → Tokens) to
 * exercise the publisher end to end without a real hosting account.
 */
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface MockOptions {
  reseller: { user: string; token: string };
  account: string;
}

export interface MockServer {
  url: string;
  /** dir -> file name -> content */
  files: Map<string, Map<string, Uint8Array>>;
  issuedTokens: string[];
  uploadRequests: number;
  close: () => Promise<void>;
}

export async function startMockCpanel(opts: MockOptions): Promise<MockServer> {
  const state: MockServer = {
    url: '',
    files: new Map([['public_html', new Map()]]),
    issuedTokens: [],
    uploadRequests: 0,
    close: async () => {},
  };

  const json = (res: import('node:http').ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  const uapiOk = (data: unknown) => ({ status: 1, data, errors: null, messages: null });
  const uapiFail = (msg: string) => ({ status: 0, data: null, errors: [msg], messages: null });

  const server = createServer(async (req, res) => {
    const url = new URL(req.url!, 'http://localhost');
    const auth = req.headers.authorization ?? '';
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const body = Buffer.concat(chunks);

    if (url.pathname === '/json-api/cpanel') {
      if (auth !== `whm ${opts.reseller.user}:${opts.reseller.token}`) return json(res, 403, { error: 'denied' });
      const user = url.searchParams.get('cpanel_jsonapi_user');
      if (user !== opts.account) {
        return json(res, 200, { result: uapiFail(`User “${user}” is not owned by ${opts.reseller.user}.`) });
      }
      if (url.searchParams.get('cpanel_jsonapi_module') === 'Tokens' && url.searchParams.get('cpanel_jsonapi_func') === 'create_full_access') {
        if (!url.searchParams.get('expires_at')) return json(res, 200, { result: uapiFail('expected expires_at') });
        const token = `TOKEN${state.issuedTokens.length + 1}`;
        state.issuedTokens.push(token);
        return json(res, 200, { result: uapiOk({ token, name: url.searchParams.get('name') }) });
      }
      return json(res, 200, { result: uapiFail('unsupported in mock') });
    }

    if (url.pathname.startsWith('/execute/')) {
      if (!state.issuedTokens.some((t) => auth === `cpanel ${opts.account}:${t}`)) return json(res, 401, {});
      const [, , module, func] = url.pathname.split('/');
      if (module === 'Fileman' && func === 'list_files') {
        const dir = state.files.get(url.searchParams.get('dir')!);
        if (!dir) return json(res, 200, uapiFail('No such directory'));
        return json(res, 200, uapiOk([...dir.keys()].map((file) => ({ file, type: 'file' }))));
      }
      if (module === 'Fileman' && func === 'get_file_content') {
        const content = state.files.get(url.searchParams.get('dir')!)?.get(url.searchParams.get('file')!);
        if (!content) return json(res, 200, uapiFail('No such file'));
        return json(res, 200, uapiOk({ content: Buffer.from(content).toString('utf8') }));
      }
      if (module === 'Fileman' && func === 'upload_files' && req.method === 'POST') {
        state.uploadRequests++;
        const form = await new Response(body, { headers: { 'content-type': req.headers['content-type']! } }).formData();
        const dir = state.files.get(String(form.get('dir')));
        if (!dir) return json(res, 200, uapiFail('No such directory'));
        for (const [key, value] of form.entries()) {
          if (!key.startsWith('file-') || typeof value === 'string') continue;
          if (dir.has(value.name) && form.get('overwrite') !== '1') return json(res, 200, uapiFail(`${value.name} exists`));
          dir.set(value.name, new Uint8Array(await value.arrayBuffer()));
        }
        return json(res, 200, uapiOk({ succeeded: 1 }));
      }
      return json(res, 200, uapiFail('unsupported in mock'));
    }
    json(res, 404, {});
  });

  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  state.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  state.close = () => new Promise((r) => server.close(() => r()));
  return state;
}
