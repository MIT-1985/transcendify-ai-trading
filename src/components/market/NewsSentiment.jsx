import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Newspaper, TrendingUp, TrendingDown, Clock, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

export default function NewsSentiment({ symbol }) {
  const { data: newsData, isLoading } = useQuery({
    queryKey: ['marketNews', symbol],
    queryFn: async () => {
      const response = await base44.functions.invoke('marketNews', { symbol });
      return response.data;
    },
    refetchInterval: 300000, // Refresh every 5 minutes
    enabled: !!symbol
  });

  const getSentimentColor = (score) => {
    if (score >= 0.6) return 'text-green-400 bg-green-500/20 border-green-500/30';
    if (score >= 0.4) return 'text-yellow-400 bg-yellow-500/20 border-yellow-500/30';
    return 'text-red-400 bg-red-500/20 border-red-500/30';
  };

  const getSentimentLabel = (score) => {
    if (score >= 0.6) return 'Bullish';
    if (score >= 0.4) return 'Neutral';
    return 'Bearish';
  };

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <Newspaper className="w-5 h-5 text-blue-400" />
          Market News & Sentiment
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            ))}
          </div>
        ) : newsData?.news?.length > 0 ? (
          <div className="space-y-4">
            {/* Overall Sentiment */}
            <div className="bg-slate-800/50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-slate-400 text-sm">Overall Sentiment</span>
                <Badge className={getSentimentColor(newsData.overallSentiment)}>
                  {newsData.overallSentiment >= 0.5 ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
                  {getSentimentLabel(newsData.overallSentiment)} ({(newsData.overallSentiment * 100).toFixed(0)}%)
                </Badge>
              </div>
              <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                <div 
                  className={`h-full transition-all ${
                    newsData.overallSentiment >= 0.6 ? 'bg-green-500' :
                    newsData.overallSentiment >= 0.4 ? 'bg-yellow-500' : 'bg-red-500'
                  }`}
                  style={{ width: `${newsData.overallSentiment * 100}%` }}
                />
              </div>
            </div>

            {/* News Articles */}
            <div className="space-y-3 max-h-[400px] overflow-y-auto">
              {newsData.news.map((article, idx) => (
                <div key={idx} className="bg-slate-800/30 rounded-lg p-3 hover:bg-slate-800/50 transition-colors">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h4 className="text-sm font-semibold text-white line-clamp-2">{article.title}</h4>
                    <Badge className={getSentimentColor(article.sentiment)} variant="outline">
                      {(article.sentiment * 100).toFixed(0)}%
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-400 mb-2 line-clamp-2">{article.summary}</p>
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 text-slate-500">
                      <Clock className="w-3 h-3" />
                      {new Date(article.published).toLocaleDateString()}
                    </div>
                    {article.url && (
                      <a 
                        href={article.url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-blue-400 hover:text-blue-300"
                      >
                        Read <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-slate-500">
            No news available for this symbol
          </div>
        )}
      </CardContent>
    </Card>
  );
}