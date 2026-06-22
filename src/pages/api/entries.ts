export const prerender = false;

import type { APIRoute } from 'astro';

const REPO = 'riccardinaburdo/spigadolce';
const BRANCH = 'main';

function getToken() {
  return process.env.GITHUB_TOKEN;
}

function checkAuth(request: Request): boolean {
  const auth = request.headers.get('Authorization');
  if (!auth) return false;
  return auth === `Bearer ${process.env.ADMIN_PASSWORD}`;
}

async function ghFetch(path: string, opts: RequestInit = {}) {
  const token = getToken();
  const res = await fetch(`https://api.github.com/repos/${REPO}/${path}`, {
    ...opts,
    headers: {
      Authorization: `token ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      ...((opts.headers as Record<string, string>) || {}),
    },
  });
  return res;
}

// GET /api/entries?folder=src/content/blog
export const GET: APIRoute = async ({ request }) => {
  if (!checkAuth(request)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const url = new URL(request.url);
  const folder = url.searchParams.get('folder');
  if (!folder) {
    return new Response(JSON.stringify({ error: 'Missing folder param' }), { status: 400 });
  }

  const res = await ghFetch(`contents/${folder}?ref=${BRANCH}`);
  if (!res.ok) {
    return new Response(JSON.stringify({ entries: [] }), { headers: { 'Content-Type': 'application/json' } });
  }

  const files = await res.json();
  const jsonFiles = Array.isArray(files) ? files.filter((f: any) => f.name.endsWith('.json')) : [];

  const entries = await Promise.all(
    jsonFiles.map(async (f: any) => {
      const fileRes = await ghFetch(`contents/${f.path}?ref=${BRANCH}`);
      if (!fileRes.ok) return null;
      const fileData = await fileRes.json();
      try {
        const content = JSON.parse(atob(fileData.content));
        return { path: f.path, sha: fileData.sha, name: f.name, ...content };
      } catch {
        return null;
      }
    })
  );

  return new Response(JSON.stringify({ entries: entries.filter(Boolean) }), {
    headers: { 'Content-Type': 'application/json' },
  });
};

// POST /api/entries  { folder, filename, content }
export const POST: APIRoute = async ({ request }) => {
  if (!checkAuth(request)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const body = await request.json();
  const { folder, filename, content } = body;

  const filePath = `${folder}/${filename}`;
  const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(content, null, 2) + '\n')));

  const res = await ghFetch(`contents/${filePath}`, {
    method: 'PUT',
    body: JSON.stringify({ message: `Add ${filename} via dashboard`, content: encoded, branch: BRANCH }),
  });

  if (!res.ok) {
    const err = await res.json();
    return new Response(JSON.stringify({ error: 'Failed to create', details: err }), { status: 500 });
  }

  const data = await res.json();
  return new Response(JSON.stringify({ ok: true, sha: data.content.sha }), {
    headers: { 'Content-Type': 'application/json' },
  });
};

// PUT /api/entries  { path, sha, content }
export const PUT: APIRoute = async ({ request }) => {
  if (!checkAuth(request)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const body = await request.json();
  const { path, sha, content } = body;

  const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(content, null, 2) + '\n')));

  const res = await ghFetch(`contents/${path}`, {
    method: 'PUT',
    body: JSON.stringify({ message: `Update ${path.split('/').pop()} via dashboard`, content: encoded, sha, branch: BRANCH }),
  });

  if (!res.ok) {
    const err = await res.json();
    return new Response(JSON.stringify({ error: 'Failed to update', details: err }), { status: 500 });
  }

  const data = await res.json();
  return new Response(JSON.stringify({ ok: true, sha: data.content.sha }), {
    headers: { 'Content-Type': 'application/json' },
  });
};

// DELETE /api/entries  { path, sha }
export const DELETE: APIRoute = async ({ request }) => {
  if (!checkAuth(request)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const body = await request.json();
  const { path, sha } = body;

  const res = await ghFetch(`contents/${path}`, {
    method: 'DELETE',
    body: JSON.stringify({ message: `Delete ${path.split('/').pop()} via dashboard`, sha, branch: BRANCH }),
  });

  if (!res.ok) {
    const err = await res.json();
    return new Response(JSON.stringify({ error: 'Failed to delete', details: err }), { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
