const NOVEL_AI_V4_ENDPOINT = 'https://image.novelai.net/ai/generate-image-stream';
const NOVEL_AI_LEGACY_ENDPOINT = 'https://image.novelai.net/ai/generate-image';

function setCors(res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.setHeader('Cache-Control', 'no-store');
}

function normalizeApiKey(raw?: string): string {
  return String(raw || '').trim().replace(/^Authorization:\s*/i, '').replace(/^Bearer\s+/i, '').trim();
}

function targetForBody(body: any): string {
  const model = typeof body?.model === 'string' ? body.model : '';
  return model.includes('nai-diffusion-4') ? NOVEL_AI_V4_ENDPOINT : NOVEL_AI_LEGACY_ENDPOINT;
}

function sanitizeError(value: unknown): string {
  return String(value || 'NovelAI proxy request failed')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]')
    .slice(0, 200);
}

export default async function handler(req: any, res: any) {
  setCors(res);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  try {
    const apiKey = normalizeApiKey(req.headers.authorization);
    if (!apiKey) {
      res.status(400).json({ error: 'Missing Authorization header.' });
      return;
    }

    const requestBody = req.body?.body && typeof req.body.body === 'object' ? req.body.body : req.body;
    if (!requestBody || typeof requestBody !== 'object') {
      res.status(400).json({ error: 'Invalid NovelAI request body.' });
      return;
    }

    const upstream = await fetch(targetForBody(requestBody), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    res.status(upstream.status);

    const arrayBuffer = await upstream.arrayBuffer();
    const bufferCtor = (globalThis as any).Buffer;
    res.send(bufferCtor ? bufferCtor.from(arrayBuffer) : arrayBuffer);
  } catch (error: any) {
    res.status(500).json({ error: sanitizeError(error?.message || error) });
  }
}
