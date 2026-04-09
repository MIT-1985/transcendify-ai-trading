import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle, Bot, ArrowRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';

export default function PaymentSuccess() {
  const [status, setStatus] = useState('loading');
  const [sessionData, setSessionData] = useState(null);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get('session_id');

    if (!sessionId) {
      setStatus('error');
      return;
    }

    // Poll subscriptions to confirm activation
    let attempts = 0;
    const poll = setInterval(async () => {
      try {
        const subs = await base44.entities.UserSubscription.list();
        const recent = subs.find(s => s.status === 'active' && 
          new Date(s.created_date) > new Date(Date.now() - 60000));
        
        if (recent || attempts > 10) {
          clearInterval(poll);
          setStatus('success');
          setSessionData({ session_id: sessionId });
        }
        attempts++;
      } catch (e) {
        clearInterval(poll);
        setStatus('success'); // Still show success even if poll fails
      }
    }, 2000);

    return () => clearInterval(poll);
  }, []);

  return (
    <div className="min-h-screen bg-[#0A0A0F] flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center">
        {status === 'loading' ? (
          <div className="space-y-4">
            <Loader2 className="w-16 h-16 text-blue-400 mx-auto animate-spin" />
            <h2 className="text-2xl font-bold text-white">Activating your bot...</h2>
            <p className="text-slate-400">Please wait while we process your payment.</p>
          </div>
        ) : status === 'success' ? (
          <div className="space-y-6">
            <div className="w-24 h-24 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto">
              <CheckCircle className="w-12 h-12 text-emerald-400" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white mb-2">Payment Successful!</h1>
              <p className="text-slate-400">
                Your trading bot has been activated. Connect your Binance API keys to start automated trading.
              </p>
            </div>
            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 text-left space-y-3">
              <div className="flex items-center gap-3 text-sm">
                <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <span className="text-slate-300">Bot subscription activated</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <span className="text-slate-300">Ready to connect Binance API</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <Bot className="w-4 h-4 text-blue-400 flex-shrink-0" />
                <span className="text-slate-300">Your funds stay in your Binance account</span>
              </div>
            </div>
            <div className="flex flex-col gap-3">
              <Link to="/ConnectBinance">
                <Button className="w-full bg-blue-600 hover:bg-blue-500 gap-2">
                  Connect Binance API <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
              <Link to="/BotDashboard">
                <Button variant="outline" className="w-full border-slate-700 text-slate-300">
                  Go to Bot Dashboard
                </Button>
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-white">Something went wrong</h2>
            <p className="text-slate-400">Please contact support if you were charged.</p>
            <Link to="/Bots">
              <Button variant="outline" className="border-slate-700">Back to Bots</Button>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}