import type { APIRoute } from 'astro';
import Stripe from 'stripe';
import { Resend } from 'resend';

export const prerender = false;

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
}

function bookingConfirmationHtml(opts: {
  customerName: string;
  classTitle: string;
  classDate: string;
  classTime: string;
  classLocation: string;
  totalSpots: number;
  totalPaid: number;
  currency: string;
  sessionId: string;
}) {
  const { customerName, classTitle, classDate, classTime, classLocation, totalSpots, totalPaid, currency, sessionId } = opts;
  const formattedDate = classDate ? formatDate(classDate) : '—';
  const dateTime = classTime ? `${formattedDate} at ${classTime}` : formattedDate;
  const symbol = currency === 'gbp' ? '£' : '€';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Booking Confirmed – Spigadolce</title>
</head>
<body style="margin:0;padding:0;background:#f4f1ed;font-family:'Lato',Arial,sans-serif;color:#3B1A0E;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ed;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr>
          <td style="background:#3B1A0E;padding:32px 40px;text-align:center;">
            <p style="margin:0;font-family:Georgia,serif;font-size:28px;color:#ffffff;letter-spacing:0.04em;">Spigadolce</p>
            <p style="margin:6px 0 0;font-size:13px;color:rgba(255,255,255,0.6);letter-spacing:0.12em;text-transform:uppercase;">Authentic Italian Pasta</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:40px 40px 32px;">
            <p style="margin:0 0 8px;font-size:13px;color:#ff7800;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;">Booking Confirmed</p>
            <h1 style="margin:0 0 24px;font-family:Georgia,serif;font-size:26px;color:#3B1A0E;line-height:1.2;">You're all set, ${customerName}!</h1>
            <p style="margin:0 0 28px;font-size:15px;line-height:1.7;color:#555;">Your spot${totalSpots > 1 ? 's are' : ' is'} confirmed. We can't wait to cook with you!</p>

            <!-- Class details box -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#fdf9f5;border-radius:12px;border:1px solid #f0e8df;margin-bottom:28px;">
              <tr><td style="padding:24px 28px;">
                <p style="margin:0 0 16px;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#aaa;">Your Booking</p>

                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding:6px 0;font-size:14px;color:#888;width:110px;">Class</td>
                    <td style="padding:6px 0;font-size:14px;font-weight:700;color:#3B1A0E;">${classTitle}</td>
                  </tr>
                  <tr>
                    <td style="padding:6px 0;font-size:14px;color:#888;">Date</td>
                    <td style="padding:6px 0;font-size:14px;color:#3B1A0E;">${dateTime}</td>
                  </tr>
                  <tr>
                    <td style="padding:6px 0;font-size:14px;color:#888;">Location</td>
                    <td style="padding:6px 0;font-size:14px;color:#3B1A0E;">${classLocation}</td>
                  </tr>
                  <tr>
                    <td style="padding:6px 0;font-size:14px;color:#888;">Spots</td>
                    <td style="padding:6px 0;font-size:14px;color:#3B1A0E;">${totalSpots}</td>
                  </tr>
                  <tr>
                    <td style="padding:6px 0;font-size:14px;color:#888;">Total paid</td>
                    <td style="padding:6px 0;font-size:15px;font-weight:700;color:#ff7800;">${symbol}${totalPaid.toFixed(2)}</td>
                  </tr>
                </table>
              </td></tr>
            </table>

            <p style="margin:0 0 8px;font-size:15px;line-height:1.7;color:#555;">All equipment and ingredients are provided — just bring yourself and your appetite.</p>
            <p style="margin:0 0 28px;font-size:15px;line-height:1.7;color:#555;">If you have any questions or dietary requirements, please reply to this email or contact us at <a href="mailto:spigadolce@gmail.com" style="color:#ff7800;text-decoration:none;">spigadolce@gmail.com</a>.</p>

            <p style="margin:0;font-size:15px;line-height:1.7;color:#555;">See you in the kitchen,<br/><strong style="color:#3B1A0E;">Riccardina · Spigadolce</strong></p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f7f4ef;padding:20px 40px;text-align:center;border-top:1px solid #f0e8df;">
            <p style="margin:0;font-size:12px;color:#aaa;line-height:1.6;">
              Booking ref: ${sessionId.slice(-12).toUpperCase()}<br/>
              © ${new Date().getFullYear()} Spigadolce · <a href="https://spigadolce.vercel.app" style="color:#aaa;">spigadolce.com</a>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export const POST: APIRoute = async ({ request }) => {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

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
    const meta = session.metadata ?? {};

    const customerEmail = session.customer_details?.email ?? '';
    const customerName = session.customer_details?.name?.split(' ')[0] ?? 'there';
    const totalPaid = (session.amount_total ?? 0) / 100;
    const currency = session.currency ?? 'gbp';

    const quantities = (meta.quantities ?? '').split(',').map(Number);
    const totalSpots = quantities.reduce((a, b) => a + (b || 1), 0) || 1;

    const resendKey = process.env.RESEND_API_KEY;
    const fromAddress = process.env.RESEND_FROM ?? 'Spigadolce <hello@spigadolce.com>';
    const notifyAddress = process.env.NOTIFY_EMAIL ?? 'spigadolce@gmail.com';

    if (resendKey && customerEmail) {
      const resend = new Resend(resendKey);

      const html = bookingConfirmationHtml({
        customerName,
        classTitle: meta.classTitle ?? 'Pasta Class',
        classDate: meta.classDate ?? '',
        classTime: meta.classTime ?? '',
        classLocation: meta.classLocation ?? '',
        totalSpots,
        totalPaid,
        currency,
        sessionId: session.id,
      });

      // Confirmation to customer
      await resend.emails.send({
        from: fromAddress,
        to: customerEmail,
        subject: `Booking Confirmed – ${meta.classTitle ?? 'Spigadolce Pasta Class'}`,
        html,
      });

      // Notification to Spigadolce
      await resend.emails.send({
        from: fromAddress,
        to: notifyAddress,
        subject: `New Booking: ${meta.classTitle ?? 'Pasta Class'} — ${customerEmail}`,
        html: `<p>New booking received.</p>
<ul>
  <li><strong>Customer:</strong> ${session.customer_details?.name ?? '—'} (${customerEmail})</li>
  <li><strong>Class:</strong> ${meta.classTitle ?? '—'}</li>
  <li><strong>Date:</strong> ${meta.classDate ? formatDate(meta.classDate) : '—'}${meta.classTime ? ' at ' + meta.classTime : ''}</li>
  <li><strong>Spots:</strong> ${totalSpots}</li>
  <li><strong>Total:</strong> ${currency === 'gbp' ? '£' : '€'}${totalPaid.toFixed(2)}</li>
  <li><strong>Session:</strong> ${session.id}</li>
</ul>`,
      });

      console.log(`[Stripe] Confirmation sent to ${customerEmail}`);
    } else {
      console.warn('[Stripe] Resend not configured or no customer email — skipping confirmation');
    }
  }

  return new Response(JSON.stringify({ received: true }), { status: 200 });
};
