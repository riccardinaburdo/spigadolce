import type { APIRoute } from 'astro';
import Stripe from 'stripe';
import fs from 'node:fs';
import path from 'node:path';

export const prerender = false;

function loadClassBySlug(slug: string) {
  const classesDir = path.join(process.cwd(), 'src/content/cooking-classes');
  const classFile = path.join(classesDir, `${slug}.json`);
  if (fs.existsSync(classFile)) {
    return JSON.parse(fs.readFileSync(classFile, 'utf-8'));
  }
  const files = fs.readdirSync(classesDir).filter(f => f.endsWith('.json'));
  for (const f of files) {
    const data = JSON.parse(fs.readFileSync(path.join(classesDir, f), 'utf-8'));
    if (data.slug === slug) return data;
  }
  return null;
}

export const POST: APIRoute = async ({ request }) => {
  const stripe = new Stripe(import.meta.env.STRIPE_SECRET_KEY);
  const origin = new URL(request.url).origin;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), { status: 400 });
  }

  // Support both cart array and legacy single-item
  const cartItems: { slug: string; quantity: number }[] = body.items
    ? body.items
    : [{ slug: body.slug, quantity: parseInt(body.quantity) || 1 }];

  const lineItems = [];

  for (const cartItem of cartItems) {
    const classData = loadClassBySlug(cartItem.slug);
    if (!classData) {
      return new Response(JSON.stringify({ error: `Class not found: ${cartItem.slug}` }), { status: 404 });
    }

    const formattedDate = new Date(classData.date).toLocaleDateString('en-GB', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });

    lineItems.push({
      quantity: cartItem.quantity,
      price_data: {
        currency: classData.currency?.toLowerCase() ?? 'gbp',
        unit_amount: Math.round(classData.price * 100),
        product_data: {
          name: classData.subtitle ?? classData.title,
          description: `${formattedDate} · ${classData.location}`,
          images: classData.coverImage ? [`${origin}${classData.coverImage}`] : [],
        },
      },
    });
  }

  const primarySlug = cartItems[0].slug;
  const primaryClass = loadClassBySlug(primarySlug);

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: lineItems,
    metadata: {
      slugs: cartItems.map(i => i.slug).join(','),
      classTitle: primaryClass?.title ?? '',
      classDate: primaryClass?.date ?? '',
    },
    success_url: `${origin}/booking/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: cartItems.length === 1 ? `${origin}/cooking-classes/${primarySlug}` : `${origin}/cart`,
    allow_promotion_codes: true,
  });

  return new Response(JSON.stringify({ url: session.url }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
