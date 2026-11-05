/**
 * Minimal clients for the two cPanel APIs the publisher needs:
 *  - cPanel UAPI (port 2083), authenticated with a per-account API token,
 *    for listing, reading and uploading files.
 *  - WHM API (port 2087), authenticated with a reseller's API token, used only
 *    to create a short-lived cPanel token for one of the reseller's accounts.
 *
 * Docs: https://api.docs.cpanel.net/ (UAPI Fileman and Tokens modules, WHM "cpanel" proxy).
 */

export class CpanelError extends Error {}

interface UapiResponse<T> {
  status: number;
  data: T;
  errors: string[] | null;
  messages?: string[] | null;
}

export interface CpanelAuth {
  /** e.g. https://server.example.com:2083 */
  baseUrl: string;
  user: string;
  token: string;
}

export interface RemoteEntry {
  file: string;
  type: string;
}

export interface UploadItem {
  name: string;
  content: string | Uint8Array;
}

async function readJson(res: Response, what: string): Promise<unknown> {
  const text = await res.text();
  if (res.status === 401 || res.status === 403) {
    throw new CpanelError(`${what}: the server refused the login (HTTP ${res.status}). Check the user name and API token.`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new CpanelError(`${what}: unexpected reply from the server (HTTP ${res.status}): ${text.slice(0, 200)}`);
  }
}

export class CpanelClient {
  readonly auth: CpanelAuth;

  constructor(auth: CpanelAuth) {
    this.auth = auth;
  }

  private async call<T>(module: string, func: string, params: Record<string, string> = {}, body?: FormData): Promise<T> {
    const url = new URL(`/execute/${module}/${func}`, this.auth.baseUrl);
    if (!body) for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const res = await fetch(url, {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: `cpanel ${this.auth.user}:${this.auth.token}` },
      body,
    });
    const json = (await readJson(res, `${module}::${func}`)) as UapiResponse<T>;
    if (json.status !== 1) {
      throw new CpanelError(`${module}::${func} failed: ${(json.errors ?? ['unknown error']).join('; ')}`);
    }
    return json.data;
  }

  /** Files and folders directly inside `dir` (relative to the account's home folder). */
  async listFiles(dir: string): Promise<RemoteEntry[]> {
    const data = await this.call<RemoteEntry[]>('Fileman', 'list_files', { dir, show_hidden: '1', include_mime: '0' });
    return (data ?? []).map((e) => ({ file: e.file, type: e.type }));
  }

  async getFileContent(dir: string, file: string): Promise<string> {
    const data = await this.call<{ content: string }>('Fileman', 'get_file_content', { dir, file });
    return data.content;
  }

  /** Upload files into one folder, overwriting files with the same name. */
  async uploadFiles(dir: string, files: UploadItem[]): Promise<void> {
    const form = new FormData();
    form.set('dir', dir);
    form.set('overwrite', '1');
    files.forEach((f, i) => {
      const bytes = typeof f.content === 'string' ? new TextEncoder().encode(f.content) : f.content;
      form.set(`file-${i + 1}`, new Blob([bytes as BlobPart]), f.name);
    });
    await this.call('Fileman', 'upload_files', {}, form);
  }
}

export interface WhmAuth {
  /** e.g. https://server.example.com:2087 */
  baseUrl: string;
  /** The reseller's WHM user name. */
  user: string;
  token: string;
}

/**
 * Ask WHM for a cPanel API token on one of the reseller's accounts.
 * The token expires after `ttlSeconds`, so prototype runs don't leave
 * permanent credentials behind. (In the finished product the WHMCS module
 * creates one long-lived token per account and the builder stores it encrypted.)
 */
export async function createAccountToken(whm: WhmAuth, cpanelUser: string, ttlSeconds = 3600): Promise<string> {
  const url = new URL('/json-api/cpanel', whm.baseUrl);
  const name = `mwha-builder-${Date.now()}`;
  const params: Record<string, string> = {
    'api.version': '1',
    cpanel_jsonapi_user: cpanelUser,
    cpanel_jsonapi_apiversion: '3',
    cpanel_jsonapi_module: 'Tokens',
    cpanel_jsonapi_func: 'create_full_access',
    name,
    expires_at: String(Math.floor(Date.now() / 1000) + ttlSeconds),
  };
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { Authorization: `whm ${whm.user}:${whm.token}` } });
  const json = (await readJson(res, 'WHM token request')) as {
    result?: UapiResponse<{ token?: string }>;
    metadata?: { result?: number; reason?: string };
  };
  const token = json.result?.data?.token;
  if (json.result?.status === 1 && token) return token;
  const reason = json.result?.errors?.join('; ') || json.metadata?.reason || 'no token in the reply';
  throw new CpanelError(
    `Could not create an API token for "${cpanelUser}" through WHM: ${reason}. ` +
      'Check that this account belongs to your reseller and that your WHM token is valid.',
  );
}
