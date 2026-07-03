function sendJson(res: any, status: number, payload: Record<string, unknown>) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

function normalizeApiKey(raw?: string): string {
  return String(raw || '')
    .trim()
    .replace(/^authorization\s*:\s*/i, '')
    .trim()
    .replace(/^bearer\s+/i, '')
    .trim();
}

function sanitize(text: unknown, apiKey?: string): string {
  let output = String(text || '');
  const secret = normalizeApiKey(apiKey);
  if (secret) output = output.split(secret).join('[redacted]');
  return output
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
    .replace(/sk-[A-Za-z0-9_-]{8,}/gi, '[redacted]')
    .slice(0, 600);
}

function isPrivateHost(hostname: string): boolean {
  const host = String(hostname || '').toLowerCase();
  if (!host || host === 'localhost' || host.endsWith('.localhost')) return true;
  if (/^(127\.|10\.|192\.168\.|169\.254\.)/.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;
  if (host === '0.0.0.0' || host === '::1' || host === '[::1]') return true;
  return false;
}

function isAllowedAiPath(pathname: string): boolean {
  return /\/(api\/)?v\d+\/(embeddings|rerank|models)(\/models|\/count|\/user)?$/i.test(pathname)
    || /\/(api\/)?v\d+\/embeddings\/models$/i.test(pathname)
    || /\/(embeddings|rerank|models)(\/models|\/count|\/user)?$/i.test(pathname);
}

function parseBody(req: any): Promise<any> {
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body);
  if (typeof req.body === 'string') {
    try {
      return Promise.resolve(req.body ? JSON.parse(req.body) : {});
    } catch {
      return Promise.reject(new Error('Invalid JSON body'));
    }
  }
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk: any) => {
      raw += chunk;
      if (raw.length > 1024 * 1024) {
        reject(new Error('Request too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method Not Allowed' });
    return;
  }

  let payload: any;
  try {
    payload = await parseBody(req);
  } catch (error: any) {
    sendJson(res, 400, { error: error?.message || 'Invalid request body' });
    return;
  }

  const apiKey = normalizeApiKey(payload.apiKey);
  const method = String(payload.method || 'POST').toUpperCase();
  const bodyText = String(payload.bodyText || '');
  let target: URL;

  try {
    target = new URL(String(payload.url || ''));
  } catch {
    sendJson(res, 400, { error: 'Invalid target URL' });
    return;
  }

  if (!apiKey) {
    sendJson(res, 400, { error: 'API key is required' });
    return;
  }

  if (target.protocol !== 'https:' || isPrivateHost(target.hostname) || !isAllowedAiPath(target.pathname)) {
    sendJson(res, 400, { error: 'Target is not an allowed AI embedding or rerank endpoint' });
    return;
  }

  if (method !== 'GET' && method !== 'POST') {
    sendJson(res, 400, { error: 'Unsupported method' });
    return;
  }

  try {
    const upstream = await fetch(target.href, {
      method,
      headers: {
        Accept: 'application/json',
        ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
        Authorization: `Bearer ${apiKey}`,
      },
      ...(method === 'POST' ? { body: bodyText } : {}),
    });
    const text = await upstream.text();
    res.statusCode = upstream.status;
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(sanitize(text, apiKey));
  } catch (error: any) {
    sendJson(res, 502, { error: sanitize(error?.message || 'Upstream request failed', apiKey) });
  }
}
