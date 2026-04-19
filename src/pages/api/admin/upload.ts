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

function ghHeaders() {
  return {
    'Authorization': `token ${process.env.GITHUB_TOKEN}`,
    'Accept': 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
  };
}

export const POST: APIRoute = async ({ request }) => {
  if (!checkAuth(request)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const { filename, content } = await request.json();

  if (!filename || !content) {
    return new Response(JSON.stringify({ error: 'filename and content required' }), { status: 400 });
  }

  // Sanitize filename
  const safeName = filename.replace(/[^a-z0-9.\-_]/gi, '-').toLowerCase();
  const filePath = `${UPLOAD_PATH}/${safeName}`;

  // Check if file already exists (to get sha for update)
  let sha: string | undefined;
  const checkRes = await fetch(
    `https://api.github.com/repos/${REPO}/contents/${filePath}`,
    { headers: ghHeaders() }
  );
  if (checkRes.ok) {
    const existing = await checkRes.json();
    sha = existing.sha;
  }

  const body: Record<string, string> = {
    message: `Admin: upload image ${safeName}`,
    content, // already base64
  };
  if (sha) body.sha = sha;

  const res = await fetch(
    `https://api.github.com/repos/${REPO}/contents/${filePath}`,
    {
      method: 'PUT',
      headers: ghHeaders(),
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) {
    const err = await res.json();
    return new Response(JSON.stringify({ error: 'Upload failed', detail: err }), { status: 500 });
  }

  return new Response(JSON.stringify({ path: `/images/cooking-classes/${safeName}` }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
