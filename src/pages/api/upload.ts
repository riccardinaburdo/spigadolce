export const prerender = false;

import type { APIRoute } from 'astro';

const REPO = 'riccardinaburdo/spigadolce';
const BRANCH = 'main';

function checkAuth(request: Request): boolean {
  const auth = request.headers.get('Authorization');
  if (!auth) return false;
  return auth === `Bearer ${process.env.ADMIN_PASSWORD}`;
}

export const POST: APIRoute = async ({ request }) => {
  if (!checkAuth(request)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  const folder = (formData.get('folder') as string) || 'blog';

  if (!file) {
    return new Response(JSON.stringify({ error: 'No file provided' }), { status: 400 });
  }

  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const safeName = file.name
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+$/, '');
  const timestamp = Date.now();
  const filename = `${safeName}-${timestamp}.${ext}`;
  const repoPath = `public/images/${folder}/${filename}`;
  const publicPath = `/images/${folder}/${filename}`;

  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  const base64 = btoa(binary);

  const token = process.env.GITHUB_TOKEN;
  const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${repoPath}`, {
    method: 'PUT',
    headers: {
      Authorization: `token ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: `Upload image ${filename} via dashboard`,
      content: base64,
      branch: BRANCH,
    }),
  });

  if (!res.ok) {
    const err = await res.json();
    return new Response(JSON.stringify({ error: 'Upload failed', details: err }), { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true, path: publicPath }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
