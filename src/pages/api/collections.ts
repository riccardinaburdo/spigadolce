export const prerender = false;

import type { APIRoute } from 'astro';

const REPO = 'riccardinaburdo/spigadolce';
const FILE_PATH = 'public/admin/collections.json';
const BRANCH = 'main';

function getToken() {
  return import.meta.env.GITHUB_TOKEN;
}

function checkAuth(request: Request): boolean {
  const auth = request.headers.get('Authorization');
  if (!auth) return false;
  const password = import.meta.env.ADMIN_PASSWORD;
  return auth === `Bearer ${password}`;
}

export const GET: APIRoute = async ({ request }) => {
  if (!checkAuth(request)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const token = getToken();
  const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${FILE_PATH}?ref=${BRANCH}`, {
    headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' },
  });

  if (!res.ok) {
    return new Response(JSON.stringify({ error: 'Failed to fetch collections' }), { status: 500 });
  }

  const data = await res.json();
  const content = JSON.parse(atob(data.content));
  return new Response(JSON.stringify({ collections: content, sha: data.sha }), {
    headers: { 'Content-Type': 'application/json' },
  });
};

export const PUT: APIRoute = async ({ request }) => {
  if (!checkAuth(request)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const token = getToken();
  const body = await request.json();
  const { collections, sha } = body;

  const content = btoa(unescape(encodeURIComponent(JSON.stringify(collections, null, 2) + '\n')));

  const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${FILE_PATH}`, {
    method: 'PUT',
    headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: 'Update CMS collections config via dashboard',
      content,
      sha,
      branch: BRANCH,
    }),
  });

  if (!res.ok) {
    const err = await res.json();
    return new Response(JSON.stringify({ error: 'Failed to save', details: err }), { status: 500 });
  }

  const data = await res.json();
  return new Response(JSON.stringify({ ok: true, sha: data.content.sha }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
