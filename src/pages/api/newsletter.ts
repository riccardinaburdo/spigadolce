import type { APIRoute } from 'astro';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  let email: string;

  try {
    const body = await request.json();
    email = (body.email ?? '').trim().toLowerCase();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request' }), { status: 400 });
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return new Response(JSON.stringify({ error: 'Invalid email address' }), { status: 400 });
  }

  const apiKey = import.meta.env.MAILCHIMP_API_KEY;
  const listId = import.meta.env.MAILCHIMP_LIST_ID;
  const dc = apiKey?.split('-').pop(); // e.g. "us21"

  if (!apiKey || !listId || !dc) {
    return new Response(JSON.stringify({ error: 'Newsletter not configured' }), { status: 500 });
  }

  const mcUrl = `https://${dc}.api.mailchimp.com/3.0/lists/${listId}/members`;

  const res = await fetch(mcUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${btoa(`anystring:${apiKey}`)}`,
    },
    body: JSON.stringify({
      email_address: email,
      status: 'subscribed',
      tags: ['spigadolce'],
    }),
  });

  if (res.ok) {
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  }

  const data = await res.json();

  // Already subscribed → treat as success
  if (data.title === 'Member Exists') {
    return new Response(JSON.stringify({ success: true, alreadySubscribed: true }), { status: 200 });
  }

  return new Response(JSON.stringify({ error: data.detail ?? 'Mailchimp error' }), { status: 500 });
};
