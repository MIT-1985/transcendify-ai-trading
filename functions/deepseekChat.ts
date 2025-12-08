import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { message, conversationHistory = [] } = await req.json();
    
    const deepseekApiKey = Deno.env.get('DEEPSEEK_API_KEY');
    if (!deepseekApiKey) {
      return Response.json({ error: 'DeepSeek API key not configured' }, { status: 500 });
    }

    // Get user's trading data for context
    const subscriptions = await base44.entities.UserSubscription.filter({ 
      created_by: user.email 
    });
    const trades = await base44.entities.Trade.list('-created_date', 50);
    const wallet = await base44.entities.Wallet.filter({ created_by: user.email });
    
    const context = {
      activeSubscriptions: subscriptions.filter(s => s.status === 'active').length,
      totalProfit: subscriptions.reduce((sum, s) => sum + (s.total_profit || 0), 0),
      totalTrades: subscriptions.reduce((sum, s) => sum + (s.total_trades || 0), 0),
      balance: wallet[0]?.balance_usd || 0,
      recentTrades: trades.slice(0, 5).map(t => ({
        symbol: t.symbol,
        side: t.side,
        profit: t.profit_loss
      }))
    };

    const systemPrompt = `You are an AI trading assistant for Transcendify, a cryptocurrency trading platform. 
You help users optimize their trading strategies and understand market conditions.

User's current status:
- Active bots: ${context.activeSubscriptions}
- Total profit: $${context.totalProfit.toFixed(2)}
- Total trades: ${context.totalTrades}
- Balance: $${context.balance.toFixed(2)}

Provide helpful, actionable advice about trading strategies, market analysis, and bot optimization.
Be concise and professional. Always prioritize risk management.`;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory,
      { role: 'user', content: message }
    ];

    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${deepseekApiKey}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: messages,
        temperature: 0.7,
        max_tokens: 1000
      })
    });

    const data = await response.json();
    
    if (!response.ok) {
      console.error('DeepSeek API error:', data);
      return Response.json({ error: 'AI service error' }, { status: 500 });
    }

    const aiResponse = data.choices[0].message.content;

    return Response.json({ 
      success: true, 
      message: aiResponse,
      context: context
    });

  } catch (error) {
    console.error('DeepSeek chat error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});