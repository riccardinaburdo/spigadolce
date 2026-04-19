import type { APIRoute } from 'astro';
import Stripe from 'stripe';

export const prerender = false;

const GIFT_CARDS = {
  group: {
    name: 'Gift Card – Group Class',
    description: 'A place in any scheduled fresh pasta class. Valid 12 months. Delivered by email.',
    price: 5500,
  },
  private: {
    name: 'Gift Card – Private Class for Two',
    description: 'An exclusive hands-on class for two – choose date & menu. Valid 12 months.',
    price: 15000,
  },
} as const;

const json = (data: object, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

export const POST: APIRoute = async ({ request }) => {
  try {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) return json({ error: 'Stripe key not configured' }, 500);

    const stripe = new Stripe(key);
    const origin = new URL(request.url).origin;

    let body: any;
    try { body = await request.json(); }
    catch { return json({ error: 'Invalid request body' }, 400); }

    const type = body.type;
    const customAmount = body.customAmount ? Math.round(parseFloat(body.customAmount) * 100) : undefined;

    let productName: string;
    let productDescription: string;
    let unitAmount: number;

    if (type === 'group' || type === 'private') {
      const card = GIFT_CARDS[type as keyof typeof GIFT_CARDS];
      productName = card.name;
      productDescription = card.description;
      unitAmount = card.price;
    } else if (type === 'custom' && customAmount && customAmount >= 3000) {
      productName = `Gift Card – £${(customAmount / 100).toFixed(0)}`;
      productDescription = 'Open-value gift card – recipient chooses the class. Valid 12 months.';
      unitAmount = customAmount;
    } else {
      return json({ error: 'Invalid gift card type or amount' }, 400);
    }

    const metadata: Record<string, string> = { type };
    if (body.recipientName) metadata.recipientName = body.recipientName;
    if (body.recipientEmail) metadata.recipientEmail = body.recipientEmail;
    if (body.message) metadata.message = String(body.message).slice(0, 500);

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        quantity: 1,
        price_data: {
          currency: 'gbp',
          unit_amount: unitAmount,
          product_data: { name: productName, description: productDescription },
        },
      }],
      metadata,
      success_url: `${origin}/booking/success?session_id={CHECKOUT_SESSION_ID}&type=gift`,
      cancel_url: `${origin}/gift-cards`,
      allow_promotion_codes: true,
    });

    return json({ url: session.url });

  } catch (err: any) {
    console.error('create-gift-checkout error:', err?.message ?? err);
    return json({ error: err?.message ?? 'Internal error' }, 500);
  }
};
