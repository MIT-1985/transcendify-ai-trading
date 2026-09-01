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
        window.location.href = createPageUrl('BotDashboard');
      } else {
        setIsChecking(false);
      }
    });
  }, []);

  const handleLogin = () => {
    base44.auth.redirectToLogin(createPageUrl('BotDashboard'));
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

          {/* Четирите неща, които наистина има. "VIP Rewards" и "Fuel Mining"
              стояха тук, след като страниците им бяха махнати - вход, който
              обещава несъществуващо, е по-лош от никакъв вход. */}
          <div className="grid grid-cols-2 gap-3 mb-12 max-w-sm mx-auto">
            <div className="bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/10">
              <Bot className="w-6 h-6 text-blue-400 mx-auto mb-2" />
              <div className="text-xs font-medium">Шест робота</div>
            </div>
            <div className="bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/10">
              <TrendingUp className="w-6 h-6 text-emerald-400 mx-auto mb-2" />
              <div className="text-xs font-medium">Данни от OKX на живо</div>
            </div>
            <div className="bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/10">
              <Shield className="w-6 h-6 text-purple-400 mx-auto mb-2" />
              <div className="text-xs font-medium">Твоите ключове, само търговия</div>
            </div>
            <div className="bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/10">
              <Zap className="w-6 h-6 text-amber-400 mx-auto mb-2" />
              <div className="text-xs font-medium">Купуваш веднъж</div>
            </div>
          </div>

          {/* Един бутон.
              "Login" и "Create account" викаха една и съща функция и правеха
              едно и също - два бутона, между които няма разлика, само карат
              човека да се чуди кой е верният. Регистрацията се появява тук,
              когато отпред застане Stripe и има какво да се регистрира. */}
          <div className="max-w-sm mx-auto">
            <Button
              onClick={handleLogin}
              size="lg"
              className="w-full bg-blue-500 hover:bg-blue-600 text-white text-base font-medium py-6 rounded-2xl shadow-lg shadow-blue-500/30 transition-all hover:shadow-blue-500/50"
            >
              Влез
            </Button>
          </div>

          <p className="text-xs text-slate-500 mt-8">
            Автоматизирана търговия с крипто · OKX · Polygon · Claude
          </p>
        </div>
      </div>
    </div>
  );
}