import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Cpu, Zap, Activity, TrendingUp, Play, Pause } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { useTranslation } from '@/components/utils/translations';

export default function DeviceMining() {
  const [isMining, setIsMining] = useState(false);
  const [activeMinutes, setActiveMinutes] = useState(0);
  const [todaysFuel, setTodaysFuel] = useState(0);
  const [language, setLanguage] = useState(() => localStorage.getItem('language') || 'en');
  const { t } = useTranslation(language);
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me()
  });

  const { data: wallet } = useQuery({
    queryKey: ['wallet', user?.email],
    queryFn: async () => {
      const wallets = await base44.entities.Wallet.filter({ created_by: user.email });
      return wallets[0];
    },
    enabled: !!user?.email
  });

  // Mining effect
  useEffect(() => {
    if (!isMining) return;

    const interval = setInterval(() => {
      setActiveMinutes(prev => {
        const newMinutes = prev + 1/60; // 1 second
        const fuelPerMinute = 0.1; // Base rate
        setTodaysFuel(t => t + fuelPerMinute / 60);
        return newMinutes;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isMining]);

  const updateWalletMutation = useMutation({
    mutationFn: async () => {
      const currentFuel = wallet?.fuel_tokens || 0;
      await base44.auth.updateMe({
        fuel_tokens: currentFuel + todaysFuel
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
    }
  });

  const handleMiningToggle = () => {
    if (isMining) {
      // Stop mining and save fuel
      updateWalletMutation.mutate();
    }
    setIsMining(!isMining);
  };

  const devicePower = {
    bg: {
      cpu: 'Процесор',
      performance: 'Производителност',
      estimated: 'Очаквано',
      perHour: 'на час'
    },
    de: {
      cpu: 'Prozessor',
      performance: 'Leistung',
      estimated: 'Geschätzt',
      perHour: 'pro Stunde'
    },
    en: {
      cpu: 'CPU',
      performance: 'Performance',
      estimated: 'Estimated',
      perHour: 'per hour'
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white p-6">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">
            {language === 'bg' ? 'Копаене с Устройство' : language === 'de' ? 'Gerät-Mining' : 'Device Mining'}
          </h1>
          <p className="text-slate-400">
            {language === 'bg' 
              ? 'Използвайте процесора на устройството си за генериране на токени за гориво'
              : language === 'de'
              ? 'Verwenden Sie die CPU Ihres Geräts, um Treibstoff-Token zu generieren'
              : 'Use your device CPU to generate fuel tokens'}
          </p>
        </div>

        {/* Mining Control */}
        <Card className="bg-slate-900/50 border-slate-800 mb-6">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-4">
                <div className={`w-16 h-16 rounded-xl flex items-center justify-center ${
                  isMining ? 'bg-emerald-500/20 animate-pulse' : 'bg-slate-800'
                }`}>
                  <Cpu className={`w-8 h-8 ${isMining ? 'text-emerald-400' : 'text-slate-500'}`} />
                </div>
                <div>
                  <h2 className="text-xl font-bold">
                    {language === 'bg' ? 'Статус на Копаене' : language === 'de' ? 'Mining-Status' : 'Mining Status'}
                  </h2>
                  <p className={`text-sm ${isMining ? 'text-emerald-400' : 'text-slate-500'}`}>
                    {isMining 
                      ? (language === 'bg' ? 'Активно Копаене' : language === 'de' ? 'Aktives Mining' : 'Active Mining')
                      : (language === 'bg' ? 'Неактивно' : language === 'de' ? 'Inaktiv' : 'Inactive')}
                  </p>
                </div>
              </div>

              <Button
                onClick={handleMiningToggle}
                size="lg"
                className={isMining 
                  ? 'bg-red-600 hover:bg-red-500' 
                  : 'bg-emerald-600 hover:bg-emerald-500'}
              >
                {isMining ? (
                  <>
                    <Pause className="w-5 h-5 mr-2" />
                    {language === 'bg' ? 'Спри Копаене' : language === 'de' ? 'Mining Stoppen' : 'Stop Mining'}
                  </>
                ) : (
                  <>
                    <Play className="w-5 h-5 mr-2" />
                    {language === 'bg' ? 'Стартирай Копаене' : language === 'de' ? 'Mining Starten' : 'Start Mining'}
                  </>
                )}
              </Button>
            </div>

            {isMining && (
              <div className="space-y-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400">
                    {language === 'bg' ? 'Активни Минути Днес' : language === 'de' ? 'Aktive Minuten Heute' : 'Active Minutes Today'}
                  </span>
                  <span className="text-white font-semibold">{activeMinutes.toFixed(1)} min</span>
                </div>
                <Progress value={(activeMinutes / 1440) * 100} className="h-2" />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-slate-400">
                {language === 'bg' ? 'Гориво Днес' : language === 'de' ? 'Treibstoff Heute' : 'Fuel Today'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Zap className="w-6 h-6 text-yellow-400" />
                <div className="text-2xl font-bold text-white">
                  {todaysFuel.toFixed(4)}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-slate-400">
                {language === 'bg' ? 'Общо Гориво' : language === 'de' ? 'Gesamt Treibstoff' : 'Total Fuel'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Activity className="w-6 h-6 text-blue-400" />
                <div className="text-2xl font-bold text-white">
                  {(wallet?.fuel_tokens || 0).toFixed(2)}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-slate-400">
                {language === 'bg' ? 'Очаквано/Час' : language === 'de' ? 'Geschätzt/Stunde' : 'Est. per Hour'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <TrendingUp className="w-6 h-6 text-emerald-400" />
                <div className="text-2xl font-bold text-white">
                  6.0
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Device Info */}
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle>
              {language === 'bg' ? 'Информация за Устройството' : language === 'de' ? 'Geräteinformationen' : 'Device Information'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-slate-800/50 rounded-lg">
              <div>
                <div className="text-sm text-slate-400">{devicePower[language].cpu}</div>
                <div className="text-lg font-semibold text-white">
                  {navigator.hardwareConcurrency || 4} {language === 'bg' ? 'Ядра' : language === 'de' ? 'Kerne' : 'Cores'}
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm text-slate-400">{devicePower[language].performance}</div>
                <div className="text-lg font-semibold text-emerald-400">
                  {language === 'bg' ? 'Средна' : language === 'de' ? 'Mittel' : 'Medium'}
                </div>
              </div>
            </div>

            <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
              <p className="text-sm text-blue-300">
                ℹ️ {language === 'bg' 
                  ? 'Копаенето на устройството използва неизползвана CPU мощност и не забавя вашия браузър'
                  : language === 'de'
                  ? 'Gerät-Mining nutzt ungenutzte CPU-Leistung und verlangsamt Ihren Browser nicht'
                  : 'Device mining uses idle CPU power and does not slow down your browser'}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}