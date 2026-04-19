import type { APIRoute } from 'astro';

export const prerender = false;

const REPO = 'riccardinaburdo/spigadolce';
const UPLOAD_PATH = 'public/images/cooking-classes';

function checkAuth(request: Request): boolean {
  const cookies: Record<string, string> = {};
  for (const part of (request.headers.get('cookie') || '').split(';')) {
    const idx = part.indexOf('=');
    if (idx < 1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    try { cookies[k] = decodeURIComponent(v); } catch { cookies[k] = v; }
  }
  const pw = process.env.ADMIN_PASSWORD;
  return !!pw && cookies['admin_auth'] === pw;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const POST: APIRoute = async ({ request }) => {
  if (!checkAuth(request)) return json({ error: 'Unauthorized' }, 401);

  const token = process.env.GITHUB_TOKEN;
  if (!token) return json({ error: 'GITHUB_TOKEN non configurato nelle variabili Vercel' }, 500);

  let body: { filename?: string; content?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const { filename, content } = body;
  if (!filename || !content) return json({ error: 'filename e content sono richiesti' }, 400);

  // Sanitize: keep extension, lowercase, replace unsafe chars
  const ext = filename.includes('.') ? filename.split('.').pop()!.toLowerCase() : 'jpg';
  const base = filename.replace(/\.[^.]+$/, '').replace(/[^a-z0-9]/gi, '-').toLowerCase().slice(0, 60);
  const safeName = base + '.' + ext;
  const filePath = `${UPLOAD_PATH}/${safeName}`;

  const ghHeaders = {
    Authorization: `token ${token}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
    'User-Agent': 'spigadolce-admin',
  };

  // Check if file already exists (need sha to overwrite)
  let sha: string | undefined;
  const checkRes = await fetch(
    `https://api.github.com/repos/${REPO}/contents/${filePath}`,
    { headers: ghHeaders }
  );
  if (checkRes.ok) {
    const existing = await checkRes.json();
    sha = existing.sha;
  }

  const payload: Record<string, string> = {
    message: `Admin: upload ${safeName}`,
    content,
  };
  if (sha) payload.sha = sha;

  const putRes = await fetch(
    `https://api.github.com/repos/${REPO}/contents/${filePath}`,
    { method: 'PUT', headers: ghHeaders, body: JSON.stringify(payload) }
  );

  if (!putRes.ok) {
    const err = await putRes.json().catch(() => ({}));
    const msg = (err as any).message || putRes.statusText;
    return json({ error: `GitHub API error (${putRes.status}): ${msg}` }, 500);
  }

  return json({ path: `/images/cooking-classes/${safeName}` });
};
