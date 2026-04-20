import type { APIRoute } from 'astro';

export const prerender = false;

const REPO = 'riccardinaburdo/spigadolce';
const CLASSES_PATH = 'src/content/cooking-classes';

function checkAuth(request: Request): boolean {
  const cookies = Object.fromEntries(
    (request.headers.get('cookie') || '').split(';')
      .map(c => c.trim().split('='))
      .filter(([k]) => k)
      .map(([k, v]) => [k.trim(), decodeURIComponent((v || '').trim())])
  );
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

async function getFileSha(slug: string): Promise<string | null> {
  const res = await fetch(
    `https://api.github.com/repos/${REPO}/contents/${CLASSES_PATH}/${slug}.json`,
    { headers: ghHeaders() }
  );
  if (!res.ok) return null;
  const data = await res.json();
  return data.sha ?? null;
}

// GET — list all classes
export const GET: APIRoute = async ({ request }) => {
  if (!checkAuth(request)) return new Response('Unauthorized', { status: 401 });

  const res = await fetch(
    `https://api.github.com/repos/${REPO}/contents/${CLASSES_PATH}`,
    { headers: ghHeaders() }
  );
  const files = await res.json();
  if (!Array.isArray(files)) {
    return new Response(JSON.stringify({ error: 'Failed to list files', detail: files }), { status: 500 });
  }

  const classes = await Promise.all(
    files
      .filter((f: any) => f.name.endsWith('.json'))
      .map(async (f: any) => {
        // Use contents API (not download_url) to avoid CDN caching stale content
        const fileRes = await fetch(
          `https://api.github.com/repos/${REPO}/contents/${CLASSES_PATH}/${f.name}`,
          { headers: ghHeaders() }
        );
        const fileData = await fileRes.json();
        const data = JSON.parse(Buffer.from(fileData.content, 'base64').toString('utf-8'));
        return { ...data, _sha: fileData.sha, _filename: f.name };
      })
  );

  classes.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return new Response(JSON.stringify(classes), { headers: { 'Content-Type': 'application/json' } });
};

// POST — create new class
export const POST: APIRoute = async ({ request }) => {
  if (!checkAuth(request)) return new Response('Unauthorized', { status: 401 });

  const body = await request.json();
  const { slug } = body;
  if (!slug) return new Response(JSON.stringify({ error: 'slug required' }), { status: 400 });

  // Check if file already exists
  const existingSha = await getFileSha(slug);
  if (existingSha) {
    return new Response(JSON.stringify({ error: `Class with slug "${slug}" already exists` }), { status: 409 });
  }

  const content = Buffer.from(JSON.stringify(body, null, 2)).toString('base64');
  const res = await fetch(
    `https://api.github.com/repos/${REPO}/contents/${CLASSES_PATH}/${slug}.json`,
    {
      method: 'PUT',
      headers: ghHeaders(),
      body: JSON.stringify({ message: `Admin: create class ${slug}`, content }),
    }
  );

  const data = await res.json();
  return new Response(JSON.stringify(data), {
    status: res.ok ? 201 : 400,
    headers: { 'Content-Type': 'application/json' },
  });
};

// PATCH — update existing class
export const PATCH: APIRoute = async ({ request }) => {
  if (!checkAuth(request)) return new Response('Unauthorized', { status: 401 });

  const body = await request.json();
  const { _sha, _filename, _oldSlug, ...classData } = body;
  const { slug } = classData;

  // When editing, _oldSlug is always sent and is the source of truth
  const oldSlug = _oldSlug || slug;

  // If slug changed: delete old file, create new one
  if (_oldSlug && _oldSlug !== slug) {
    const oldSha = await getFileSha(oldSlug);
    if (oldSha) {
      await fetch(
        `https://api.github.com/repos/${REPO}/contents/${CLASSES_PATH}/${oldSlug}.json`,
        {
          method: 'DELETE',
          headers: ghHeaders(),
          body: JSON.stringify({ message: `Admin: rename ${oldSlug} → ${slug}`, sha: oldSha }),
        }
      );
    }
    const content = Buffer.from(JSON.stringify(classData, null, 2)).toString('base64');
    const res = await fetch(
      `https://api.github.com/repos/${REPO}/contents/${CLASSES_PATH}/${slug}.json`,
      {
        method: 'PUT',
        headers: ghHeaders(),
        body: JSON.stringify({ message: `Admin: update class ${slug}`, content }),
      }
    );
    return new Response(JSON.stringify(await res.json()), {
      status: res.ok ? 200 : 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Same slug: always fetch fresh SHA from GitHub to avoid stale-SHA errors
  const sha = await getFileSha(slug);
  if (!sha) return new Response(JSON.stringify({ error: 'File not found' }), { status: 404 });

  const content = Buffer.from(JSON.stringify(classData, null, 2)).toString('base64');
  const res = await fetch(
    `https://api.github.com/repos/${REPO}/contents/${CLASSES_PATH}/${slug}.json`,
    {
      method: 'PUT',
      headers: ghHeaders(),
      body: JSON.stringify({ message: `Admin: update class ${slug}`, content, sha }),
    }
  );

  return new Response(JSON.stringify(await res.json()), {
    status: res.ok ? 200 : 400,
    headers: { 'Content-Type': 'application/json' },
  });
};

// DELETE — delete a class
export const DELETE: APIRoute = async ({ request }) => {
  if (!checkAuth(request)) return new Response('Unauthorized', { status: 401 });

  const { slug } = await request.json();
  const fileSha = await getFileSha(slug);
  if (!fileSha) return new Response(JSON.stringify({ error: 'File not found' }), { status: 404 });

  const res = await fetch(
    `https://api.github.com/repos/${REPO}/contents/${CLASSES_PATH}/${slug}.json`,
    {
      method: 'DELETE',
      headers: ghHeaders(),
      body: JSON.stringify({ message: `Admin: delete class ${slug}`, sha: fileSha }),
    }
  );

  return new Response(JSON.stringify({ ok: res.ok }), {
    status: res.ok ? 200 : 400,
    headers: { 'Content-Type': 'application/json' },
  });
};
