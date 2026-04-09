import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import Stripe from 'npm:stripe@14.21.0';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));

Deno.serve(async (req) => {
  try {
    const body = await req.text();
    const signature = req.headers.get('stripe-signature');
    const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');

    let event;
    if (webhookSecret && signature) {
      event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
    } else {
      event = JSON.parse(body);
    }

    const base44 = createClientFromRequest(req);

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const meta = session.metadata || {};

      if (session.payment_status === 'paid' && meta.bot_id) {
        console.log(`Payment successful for bot ${meta.bot_name} by ${meta.user_email}`);

        const tradingPairs = JSON.parse(meta.trading_pairs || '[]');

        await base44.asServiceRole.entities.UserSubscription.create({
          bot_id: meta.bot_id,
          status: 'active',
          start_date: new Date().toISOString().split('T')[0],
          trading_pairs: tradingPairs,
          capital_allocated: Number(meta.min_capital) || 100,
          stop_loss: Number(meta.stop_loss) || 5,
          take_profit: Number(meta.take_profit) || 10,
          total_profit: 0,
          total_trades: 0,
          api_key_configured: false,
        });

        // Record transaction
        await base44.asServiceRole.entities.Transaction.create({
          type: 'subscription_payment',
          amount: (session.amount_total || 0) / 100,
          currency: 'USD',
          status: 'completed',
          reference: session.id,
          description: `Bot subscription: ${meta.bot_name}`,
          timestamp: new Date().toISOString(),
        });

        console.log(`Subscription created for user ${meta.user_email}, bot ${meta.bot_id}`);
      }
    }

    return Response.json({ received: true });
  } catch (error) {
    console.error('stripeWebhook error:', error);
    return Response.json({ error: error.message }, { status: 400 });
  }
});