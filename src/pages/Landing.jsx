import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import { Zap, TrendingUp, Bot, Shield } from 'lucide-react';
import { createPageUrl } from '../utils';

export default function Landing() {
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    base44.auth.isAuthenticated().then(authenticated => {
      if (authenticated) {
        window.location.href = createPageUrl('Dashboard');
      } else {
        setIsChecking(false);
      }
    });
  }, []);

  const handleLogin = () => {
    base44.auth.redirectToLogin(createPageUrl('Dashboard'));
  };

  const handleSignup = () => {
    base44.auth.redirectToLogin(createPageUrl('Dashboard'));
  };

  if (isChecking) {
    return <div className="min-h-screen bg-[#1a1a2e] flex items-center justify-center">
      <div className="text-white">Loading...</div>
    </div>;
  }

  return (
    <div className="min-h-screen bg-[#1a1a2e] text-white relative overflow-hidden">
      {/* Animated background stars */}
      <div className="absolute inset-0">
        {[...Array(60)].map((_, i) => (
          <div
            key={i}
            className="absolute w-1 h-1 bg-white rounded-full animate-pulse"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 3}s`,
              animationDuration: `${2 + Math.random() * 2}s`,
              opacity: Math.random() * 0.5 + 0.3
            }}
          />
        ))}
      </div>

      {/* Shooting stars */}
      {[...Array(3)].map((_, i) => (
        <div
          key={`star-${i}`}
          className="absolute w-0.5 h-12 bg-gradient-to-b from-white to-transparent opacity-0"
          style={{
            left: `${20 + Math.random() * 60}%`,
            top: `${Math.random() * 50}%`,
            transform: 'rotate(45deg)',
            animation: `shooting-star ${3 + Math.random() * 2}s ease-in-out ${i * 4}s infinite`
          }}
        />
      ))}

      <style>{`
        @keyframes shooting-star {
          0% { opacity: 0; transform: translateX(0) translateY(0) rotate(45deg); }
          10% { opacity: 1; }
          90% { opacity: 0; }
          100% { opacity: 0; transform: translateX(300px) translateY(300px) rotate(45deg); }
        }
      `}</style>

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen px-6 py-12">
        <div className="text-center max-w-lg w-full">
          {/* Logo */}
          <div className="mb-12 flex justify-center">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-2xl shadow-blue-500/50">
              <Zap className="w-10 h-10 text-white" />
            </div>
          </div>

          {/* Title */}
          <h1 className="text-2xl font-medium mb-2 text-slate-300">
            WELCOME TO
          </h1>
          <h2 className="text-6xl font-bold mb-8 bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
            Transcendify
          </h2>

          {/* Features */}
          <div className="grid grid-cols-2 gap-3 mb-12 max-w-sm mx-auto">
            <div className="bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/10 hover:border-blue-500/50 transition-all">
              <Bot className="w-6 h-6 text-blue-400 mx-auto mb-2" />
              <div className="text-xs font-medium">AI Trading Bots</div>
            </div>
            <div className="bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/10 hover:border-emerald-500/50 transition-all">
              <TrendingUp className="w-6 h-6 text-emerald-400 mx-auto mb-2" />
              <div className="text-xs font-medium">Real-Time Data</div>
            </div>
            <div className="bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/10 hover:border-purple-500/50 transition-all">
              <Shield className="w-6 h-6 text-purple-400 mx-auto mb-2" />
              <div className="text-xs font-medium">VIP Rewards</div>
            </div>
            <div className="bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/10 hover:border-amber-500/50 transition-all">
              <Zap className="w-6 h-6 text-amber-400 mx-auto mb-2" />
              <div className="text-xs font-medium">Fuel Mining</div>
            </div>
          </div>

          {/* Buttons */}
          <div className="space-y-4 max-w-sm mx-auto">
            <Button
              onClick={handleLogin}
              size="lg"
              className="w-full bg-blue-500 hover:bg-blue-600 text-white text-base font-medium py-6 rounded-2xl shadow-lg shadow-blue-500/30 transition-all hover:shadow-blue-500/50"
            >
              Login
            </Button>
            <Button
              onClick={handleSignup}
              size="lg"
              variant="outline"
              className="w-full border-2 border-white/20 bg-transparent hover:bg-white/5 text-white text-base font-medium py-6 rounded-2xl transition-all"
            >
              Create account
            </Button>
          </div>

          <p className="text-xs text-slate-500 mt-8">
            AI-Powered Cryptocurrency Trading Platform
          </p>
        </div>
      </div>
    </div>
  );
}