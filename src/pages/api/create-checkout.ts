import type { APIRoute } from 'astro';
import Stripe from 'stripe';
import fs from 'node:fs';
import path from 'node:path';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const stripe = new Stripe(import.meta.env.STRIPE_SECRET_KEY);
  const origin = new URL(request.url).origin;

  let slug: string;
  let quantity: number;

  try {
    const body = await request.json();
    slug = body.slug;
    quantity = parseInt(body.quantity) || 1;
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), { status: 400 });
  }

  // Load class data
  const classesDir = path.join(process.cwd(), 'src/content/cooking-classes');
  const classFile = path.join(classesDir, `${slug}.json`);

  // Try to find the file by slug field if filename doesn't match
  let classData: any;
  if (fs.existsSync(classFile)) {
    classData = JSON.parse(fs.readFileSync(classFile, 'utf-8'));
  } else {
    const files = fs.readdirSync(classesDir).filter(f => f.endsWith('.json'));
    for (const f of files) {
      const data = JSON.parse(fs.readFileSync(path.join(classesDir, f), 'utf-8'));
      if (data.slug === slug) { classData = data; break; }
    }
  }

  if (!classData) {
    return new Response(JSON.stringify({ error: 'Class not found' }), { status: 404 });
  }

  const formattedDate = new Date(classData.date).toLocaleDateString('en-GB', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [
      {
        quantity,
        price_data: {
          currency: classData.currency?.toLowerCase() ?? 'gbp',
          unit_amount: Math.round(classData.price * 100),
          product_data: {
            name: classData.subtitle ?? classData.title,
            description: `${formattedDate} · ${classData.location}`,
            images: classData.coverImage
              ? [`${origin}${classData.coverImage}`]
              : [],
          },
        },
      },
    ],
    metadata: { slug, classTitle: classData.title, classDate: classData.date },
    success_url: `${origin}/booking/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/cooking-classes/${slug}`,
    allow_promotion_codes: true,
  });

  return new Response(JSON.stringify({ url: session.url }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
