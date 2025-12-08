import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ThumbsUp, ThumbsDown, Star, MessageSquare, TrendingUp } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

export default function StrategyFeedbackPanel({ subscription }) {
  const queryClient = useQueryClient();
  const [feedback, setFeedback] = useState('');
  const [rating, setRating] = useState(0);

  const { data: trades = [] } = useQuery({
    queryKey: ['recentTrades', subscription.id],
    queryFn: () => base44.entities.Trade.filter({ 
      subscription_id: subscription.id 
    }).then(t => t.slice(-10).reverse()),
    refetchInterval: 5000
  });

  const submitFeedbackMutation = useMutation({
    mutationFn: async ({ isPositive, comment }) => {
      // Store feedback for AI learning
      await base44.entities.AgentTask.create({
        agent_id: 'strategy_optimization',
        task_type: 'user_feedback',
        input_data: {
          subscription_id: subscription.id,
          bot_id: subscription.bot_id,
          strategy: subscription.strategy,
          is_positive: isPositive,
          rating: rating,
          comment: comment,
          performance_metrics: {
            total_profit: subscription.total_profit,
            total_trades: subscription.total_trades,
            win_rate: calculateWinRate()
          },
          ai_prompt: subscription.ai_prompt,
          timestamp: new Date().toISOString()
        },
        status: 'pending'
      });

      // Update subscription with feedback flag
      await base44.entities.UserSubscription.update(subscription.id, {
        last_feedback_date: new Date().toISOString(),
        feedback_count: (subscription.feedback_count || 0) + 1
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userSubscriptions'] });
      toast.success('Feedback submitted. AI will learn from your input!');
      setFeedback('');
      setRating(0);
    }
  });

  const calculateWinRate = () => {
    const winningTrades = trades.filter(t => (t.profit_loss || 0) > 0).length;
    return trades.length > 0 ? (winningTrades / trades.length) * 100 : 0;
  };

  const profitableTrades = trades.filter(t => (t.profit_loss || 0) > 0).length;
  const winRate = calculateWinRate();

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <MessageSquare className="w-5 h-5 text-blue-400" />
          Strategy Feedback
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Performance Summary */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-slate-800/50 rounded-lg p-3">
            <div className="text-xs text-slate-400 mb-1">Win Rate</div>
            <div className="text-xl font-bold text-green-400">{winRate.toFixed(1)}%</div>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-3">
            <div className="text-xs text-slate-400 mb-1">Profit</div>
            <div className={`text-xl font-bold ${subscription.total_profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              ${(subscription.total_profit || 0).toFixed(2)}
            </div>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-3">
            <div className="text-xs text-slate-400 mb-1">Trades</div>
            <div className="text-xl font-bold">{subscription.total_trades || 0}</div>
          </div>
        </div>

        {/* Rating */}
        <div>
          <div className="text-sm font-semibold mb-2">Rate this strategy</div>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                onClick={() => setRating(star)}
                className="transition-transform hover:scale-110"
              >
                <Star
                  className={`w-6 h-6 ${
                    star <= rating ? 'fill-yellow-400 text-yellow-400' : 'text-slate-600'
                  }`}
                />
              </button>
            ))}
          </div>
        </div>

        {/* Feedback Text */}
        <div>
          <div className="text-sm font-semibold mb-2">Share your thoughts</div>
          <Textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="What's working well? What could be improved? Your feedback helps the AI learn..."
            className="bg-slate-800 border-slate-700 min-h-[100px]"
          />
        </div>

        {/* Quick Actions */}
        <div className="flex gap-2">
          <Button
            onClick={() => submitFeedbackMutation.mutate({ isPositive: true, comment: feedback })}
            disabled={submitFeedbackMutation.isPending || rating === 0}
            className="flex-1 bg-green-600 hover:bg-green-500"
          >
            <ThumbsUp className="w-4 h-4 mr-2" />
            Works Great
          </Button>
          <Button
            onClick={() => submitFeedbackMutation.mutate({ isPositive: false, comment: feedback })}
            disabled={submitFeedbackMutation.isPending || rating === 0}
            variant="outline"
            className="flex-1 border-red-500/30 text-red-300 hover:bg-red-500/20"
          >
            <ThumbsDown className="w-4 h-4 mr-2" />
            Needs Work
          </Button>
        </div>

        {/* AI Learning Status */}
        {subscription.feedback_count > 0 && (
          <div className="bg-purple-900/20 border border-purple-900 rounded-lg p-3">
            <div className="flex items-center gap-2 text-sm text-purple-300">
              <TrendingUp className="w-4 h-4" />
              AI has learned from {subscription.feedback_count} feedback{subscription.feedback_count !== 1 ? 's' : ''} on this bot
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}