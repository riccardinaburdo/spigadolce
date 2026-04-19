import type { APIRoute } from 'astro';

export const prerender = false;

export const GET: APIRoute = async () => {
  return new Response(JSON.stringify({
    stripe_process: typeof process.env['STRIPE_SECRET_KEY'] !== 'undefined' ? 'SET (len=' + process.env['STRIPE_SECRET_KEY']!.length + ')' : 'MISSING',
    stripe_meta: typeof import.meta.env['STRIPE_SECRET_KEY'] !== 'undefined' ? 'SET' : 'MISSING',
    node_env: process.env.NODE_ENV,
    keys: Object.keys(process.env).filter(k => k.includes('STRIPE') || k.includes('MAIL')),
  }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
