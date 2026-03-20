import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { symbol } = await req.json();
    const ticker = symbol.replace('X:', '').replace('USD', '');
    
    const polygonApiKey = Deno.env.get('POLYGON_API_KEY');
    
    // Fetch news from Polygon
    const newsResponse = await fetch(
      `https://api.polygon.io/v2/reference/news?ticker=${ticker}&limit=10&apiKey=${polygonApiKey}`
    );
    
    const newsData = await newsResponse.json();
    
    if (!newsData.results || newsData.results.length === 0) {
      return Response.json({ 
        news: [],
        overallSentiment: 0.5
      });
    }

    // Analyze sentiment using DeepSeek
    const deepseekApiKey = Deno.env.get('DEEPSEEK_API_KEY');
    const articles = newsData.results.slice(0, 5);
    
    const sentimentPromises = articles.map(async (article) => {
      try {
        const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${deepseekApiKey}`
          },
          body: JSON.stringify({
            model: 'deepseek-chat',
            messages: [{
              role: 'user',
              content: `Analyze the sentiment of this news article title and description for ${ticker}. Return only a number between 0 (very bearish) and 1 (very bullish).\n\nTitle: ${article.title}\nDescription: ${article.description || ''}`
            }],
            temperature: 0.3,
            max_tokens: 10
          })
        });
        
        const data = await response.json();
        const sentimentText = data.choices?.[0]?.message?.content?.trim() || '0.5';
        const sentiment = parseFloat(sentimentText.match(/[\d.]+/)?.[0] || '0.5');
        
        return {
          title: article.title,
          summary: article.description || article.title,
          url: article.article_url,
          published: article.published_utc,
          sentiment: Math.max(0, Math.min(1, sentiment))
        };
      } catch (error) {
        return {
          title: article.title,
          summary: article.description || article.title,
          url: article.article_url,
          published: article.published_utc,
          sentiment: 0.5
        };
      }
    });
    
    const analyzedNews = await Promise.all(sentimentPromises);
    
    // Calculate overall sentiment
    const overallSentiment = analyzedNews.reduce((sum, n) => sum + n.sentiment, 0) / analyzedNews.length;
    
    return Response.json({
      news: analyzedNews,
      overallSentiment
    });

  } catch (error) {
    console.error('Market news error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});