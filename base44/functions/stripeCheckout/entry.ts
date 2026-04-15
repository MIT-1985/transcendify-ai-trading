import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import Stripe from 'npm:stripe@14.21.0';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { bot_id, bot_config, success_url, cancel_url } = await req.json();

    // Fetch bot details
    const bots = await base44.entities.TradingBot.filter({ id: bot_id });
    const bot = bots[0];
    if (!bot) return Response.json({ error: 'Bot not found' }, { status: 404 });

    // Check if already subscribed
    const existing = await base44.entities.UserSubscription.filter({ bot_id, status: 'active' });
    if (existing.length > 0) return Response.json({ error: 'Already subscribed' }, { status: 400 });

    const lineItems = [{
      price_data: {
        currency: 'usd',
        product_data: {
          name: bot.name,
          description: bot.description || `${bot.strategy} trading bot`,
        },
        unit_amount: Math.round((bot.price || 0) * 100),
      },
      quantity: 1,
    }];

    // Add monthly fee as a recurring item if applicable
    // (We'll handle as one-time for simplicity)

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: lineItems,
      success_url: success_url || `${req.headers.get('origin')}/PaymentSuccess?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancel_url || `${req.headers.get('origin')}/Bots`,
      customer_email: user.email,
      metadata: {
        base44_app_id: Deno.env.get('BASE44_APP_ID'),
        bot_id: bot.id,
        bot_name: bot.name,
        bot_strategy: bot.strategy || '',
        user_email: user.email,
        user_id: user.id,
        trading_pairs: JSON.stringify(bot_config?.trading_pairs || bot.supported_markets?.slice(0, 3) || []),
        min_capital: String(bot_config?.capital_allocated || bot.min_capital || 100),
        stop_loss: String(bot_config?.stop_loss || bot.default_stop_loss || 5),
        take_profit: String(bot_config?.take_profit || bot.default_take_profit || 10),
        grid_levels: String(bot_config?.grid_levels || bot.grid_levels || 10),
        grid_spacing: String(bot_config?.grid_spacing || bot.grid_spacing || 1),
        dca_interval: String(bot_config?.dca_interval || bot.dca_interval || 60),
        dca_amount: String(bot_config?.dca_amount || bot.dca_amount || 100),
        exchange: bot_config?.exchange || 'binance',
      },
    });

    return Response.json({ url: session.url, session_id: session.id });
  } catch (error) {
    console.error('stripeCheckout error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});