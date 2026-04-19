import type { APIRoute } from 'astro';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const { password } = await request.json().catch(() => ({ password: '' }));
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminPassword || password !== adminPassword) {
    return new Response(JSON.stringify({ error: 'Invalid password' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Set-Cookie': `admin_auth=${encodeURIComponent(adminPassword)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400`,
      'Content-Type': 'application/json',
    },
  });
};
