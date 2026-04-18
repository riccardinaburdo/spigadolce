import type { APIRoute } from 'astro';
import Stripe from 'stripe';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const stripe = new Stripe(import.meta.env.STRIPE_SECRET_KEY);
  const webhookSecret = import.meta.env.STRIPE_WEBHOOK_SECRET;

  const payload = await request.text();
  const sig = request.headers.get('stripe-signature');

  if (!sig || !webhookSecret) {
    return new Response('Missing signature or webhook secret', { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(payload, sig, webhookSecret);
  } catch (err: any) {
    return new Response(`Webhook error: ${err.message}`, { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    // Here you can trigger confirmation emails, update a database, etc.
    // For now, the booking confirmation is shown on the success page.
    console.log(`[Stripe] Payment completed: ${session.id}`, session.metadata);
  }

  return new Response(JSON.stringify({ received: true }), { status: 200 });
};
