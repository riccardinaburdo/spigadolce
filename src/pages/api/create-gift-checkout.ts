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

export const POST: APIRoute = async ({ request }) => {
  const stripe = new Stripe(import.meta.env.STRIPE_SECRET_KEY);
  const origin = new URL(request.url).origin;

  let type: keyof typeof GIFT_CARDS;
  let recipientName: string | undefined;
  let recipientEmail: string | undefined;
  let message: string | undefined;
  let customAmount: number | undefined;

  try {
    const body = await request.json();
    type = body.type;
    recipientName = body.recipientName;
    recipientEmail = body.recipientEmail;
    message = body.message;
    customAmount = body.customAmount ? Math.round(parseFloat(body.customAmount) * 100) : undefined;
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), { status: 400 });
  }

  let productName: string;
  let productDescription: string;
  let unitAmount: number;

  if (type === 'group' || type === 'private') {
    const card = GIFT_CARDS[type];
    productName = card.name;
    productDescription = card.description;
    unitAmount = card.price;
  } else if (type === 'custom' as any && customAmount && customAmount >= 3000) {
    productName = `Gift Card – £${(customAmount / 100).toFixed(0)}`;
    productDescription = 'Open-value gift card – recipient chooses the class. Valid 12 months.';
    unitAmount = customAmount;
  } else {
    return new Response(JSON.stringify({ error: 'Invalid gift card type or amount' }), { status: 400 });
  }

  const metadata: Record<string, string> = { type };
  if (recipientName) metadata.recipientName = recipientName;
  if (recipientEmail) metadata.recipientEmail = recipientEmail;
  if (message) metadata.message = message.slice(0, 500);

  let session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'gbp',
            unit_amount: unitAmount,
            product_data: { name: productName, description: productDescription },
          },
        },
      ],
      metadata,
      success_url: `${origin}/booking/success?session_id={CHECKOUT_SESSION_ID}&type=gift`,
      cancel_url: `${origin}/gift-cards`,
      allow_promotion_codes: true,
    });
  } catch (err: any) {
    console.error('Stripe error:', err?.message ?? err);
    return new Response(JSON.stringify({ error: err?.message ?? 'Stripe error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ url: session.url }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
