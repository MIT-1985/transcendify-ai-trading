import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Crown, Check, Zap, Shield, TrendingUp, Sparkles, Star } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useTranslation } from '@/components/utils/translations';
import { toast } from 'sonner';

const VIP_TIERS = {
  none: { name: 'Free', price: 0, color: 'slate', icon: Star },
  bronze: { name: 'Bronze', price: 29, color: 'amber', icon: Star },
  silver: { name: 'Silver', price: 79, color: 'gray', icon: Crown },
  gold: { name: 'Gold', price: 149, color: 'yellow', icon: Crown },
  platinum: { name: 'Platinum', price: 299, color: 'blue', icon: Sparkles },
  diamond: { name: 'Diamond', price: 599, color: 'purple', icon: Zap }
};

export default function VIPUpgrade() {
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

  const upgradeMutation = useMutation({
    mutationFn: async (tier) => {
      const price = VIP_TIERS[tier].price;
      const currentBalance = wallet?.balance_tfi || 0;
      
      if (currentBalance < price) {
        throw new Error(language === 'bg' ? 'Недостатъчен баланс' : language === 'de' ? 'Unzureichendes Guthaben' : 'Insufficient balance');
      }
      
      await base44.auth.updateMe({
        vip_level: tier,
        balance_tfi: currentBalance - price
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
      toast.success(language === 'bg' ? 'VIP Надграждане Успешно!' : language === 'de' ? 'VIP-Upgrade erfolgreich!' : 'VIP Upgrade Successful!');
    },
    onError: (error) => {
      toast.error(error.message);
    }
  });

  const currentTier = wallet?.vip_level || 'none';
  const tierOrder = ['none', 'bronze', 'silver', 'gold', 'platinum', 'diamond'];
  const currentTierIndex = tierOrder.indexOf(currentTier);

  const getBenefits = (tier) => {
    const benefits = {
      none: [
        { key: 'basicBots', value: '3' },
        { key: 'tradingFee', value: '0.1%' },
        { key: 'support', value: 'Email' },
        { key: 'profitBoost', value: '0%' }
      ],
      bronze: [
        { key: 'basicBots', value: '5' },
        { key: 'tradingFee', value: '0.08%' },
        { key: 'support', value: 'Priority Email' },
        { key: 'profitBoost', value: '+5%' },
        { key: 'fuelBonus', value: '+10%' }
      ],
      silver: [
        { key: 'basicBots', value: '10' },
        { key: 'tradingFee', value: '0.06%' },
        { key: 'support', value: '24/7 Chat' },
        { key: 'profitBoost', value: '+10%' },
        { key: 'fuelBonus', value: '+20%' },
        { key: 'advancedBots', value: true }
      ],
      gold: [
        { key: 'basicBots', value: 'Unlimited' },
        { key: 'tradingFee', value: '0.04%' },
        { key: 'support', value: '24/7 Priority' },
        { key: 'profitBoost', value: '+15%' },
        { key: 'fuelBonus', value: '+30%' },
        { key: 'advancedBots', value: true },
        { key: 'customStrategies', value: true }
      ],
      platinum: [
        { key: 'basicBots', value: 'Unlimited' },
        { key: 'tradingFee', value: '0.02%' },
        { key: 'support', value: 'Dedicated Manager' },
        { key: 'profitBoost', value: '+20%' },
        { key: 'fuelBonus', value: '+40%' },
        { key: 'advancedBots', value: true },
        { key: 'customStrategies', value: true },
        { key: 'exclusiveBots', value: true }
      ],
      diamond: [
        { key: 'basicBots', value: 'Unlimited' },
        { key: 'tradingFee', value: '0%' },
        { key: 'support', value: 'VIP Concierge' },
        { key: 'profitBoost', value: '+25%' },
        { key: 'fuelBonus', value: '+50%' },
        { key: 'advancedBots', value: true },
        { key: 'customStrategies', value: true },
        { key: 'exclusiveBots', value: true },
        { key: 'privateSignals', value: true }
      ]
    };
    return benefits[tier] || benefits.none;
  };

  const translateBenefit = (key, value) => {
    const translations = {
      en: {
        basicBots: 'Active Bots',
        tradingFee: 'Trading Fee',
        support: 'Support',
        profitBoost: 'Profit Boost',
        fuelBonus: 'Fuel Generation',
        advancedBots: 'Advanced Bots',
        customStrategies: 'Custom Strategies',
        exclusiveBots: 'Exclusive Bots',
        privateSignals: 'Private Signals'
      },
      bg: {
        basicBots: 'Активни Ботове',
        tradingFee: 'Такса за Търговия',
        support: 'Поддръжка',
        profitBoost: 'Увеличение на Печалба',
        fuelBonus: 'Генериране на Гориво',
        advancedBots: 'Разширени Ботове',
        customStrategies: 'Персонализирани Стратегии',
        exclusiveBots: 'Ексклузивни Ботове',
        privateSignals: 'Частни Сигнали'
      },
      de: {
        basicBots: 'Aktive Bots',
        tradingFee: 'Handelsgebühr',
        support: 'Support',
        profitBoost: 'Gewinn-Boost',
        fuelBonus: 'Treibstoffgenerierung',
        advancedBots: 'Erweiterte Bots',
        customStrategies: 'Benutzerdefinierte Strategien',
        exclusiveBots: 'Exklusive Bots',
        privateSignals: 'Private Signale'
      }
    };
    return translations[language]?.[key] || key;
  };

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold mb-2 flex items-center justify-center gap-3">
            <Crown className="w-10 h-10 text-yellow-400" />
            {language === 'bg' ? 'VIP Членство' : language === 'de' ? 'VIP-Mitgliedschaft' : 'VIP Membership'}
          </h1>
          <p className="text-slate-400">
            {language === 'bg' 
              ? 'Отключете ексклузивни функции и увеличете печалбите си'
              : language === 'de'
              ? 'Schalten Sie exklusive Funktionen frei und steigern Sie Ihre Gewinne'
              : 'Unlock exclusive features and boost your earnings'}
          </p>
        </div>

        {/* Current Status */}
        <Card className="bg-gradient-to-br from-blue-600 to-purple-600 border-0 mb-8">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-blue-100 text-sm mb-1">
                  {language === 'bg' ? 'Текущ Статус' : language === 'de' ? 'Aktueller Status' : 'Current Status'}
                </div>
                <div className="text-3xl font-bold text-white">
                  {VIP_TIERS[currentTier].name} {language === 'bg' ? 'Член' : language === 'de' ? 'Mitglied' : 'Member'}
                </div>
              </div>
              <Crown className="w-12 h-12 text-white" />
            </div>
          </CardContent>
        </Card>

        {/* VIP Tiers */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Object.entries(VIP_TIERS).map(([tier, info], index) => {
            const TierIcon = info.icon;
            const benefits = getBenefits(tier);
            const isCurrent = tier === currentTier;
            const canUpgrade = tierOrder.indexOf(tier) > currentTierIndex;
            
            return (
              <Card 
                key={tier}
                className={`relative overflow-hidden ${
                  isCurrent 
                    ? 'bg-gradient-to-br from-blue-600 to-purple-600 border-0' 
                    : 'bg-slate-900/50 border-slate-800'
                }`}
              >
                {isCurrent && (
                  <div className="absolute top-4 right-4">
                    <Badge className="bg-white text-blue-600">
                      {language === 'bg' ? 'Текущ' : language === 'de' ? 'Aktuell' : 'Current'}
                    </Badge>
                  </div>
                )}
                
                <CardHeader>
                  <div className="flex items-center gap-3 mb-4">
                    <div className={`w-12 h-12 rounded-xl bg-${info.color}-500/20 flex items-center justify-center`}>
                      <TierIcon className={`w-6 h-6 text-${info.color}-400`} />
                    </div>
                    <div>
                      <CardTitle className={isCurrent ? 'text-white' : 'text-white'}>
                        {info.name}
                      </CardTitle>
                      <div className={`text-2xl font-bold ${isCurrent ? 'text-white' : 'text-white'}`}>
                        ${info.price}
                        <span className="text-sm font-normal text-slate-400">
                          {language === 'bg' ? '/месец' : language === 'de' ? '/Monat' : '/month'}
                        </span>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                
                <CardContent>
                  <div className="space-y-3 mb-6">
                    {benefits.map((benefit, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <Check className={`w-4 h-4 ${isCurrent ? 'text-white' : 'text-emerald-400'}`} />
                        <span className={`text-sm ${isCurrent ? 'text-white' : 'text-slate-300'}`}>
                          {translateBenefit(benefit.key, benefit.value)}: {' '}
                          <span className="font-semibold">
                            {benefit.value === true ? '✓' : benefit.value}
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                  
                  {canUpgrade && (
                    <Button
                      onClick={() => upgradeMutation.mutate(tier)}
                      disabled={upgradeMutation.isPending}
                      className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500"
                    >
                      {upgradeMutation.isPending 
                        ? (language === 'bg' ? 'Обработка...' : language === 'de' ? 'Verarbeitung...' : 'Processing...')
                        : (language === 'bg' ? 'Надградете Сега' : language === 'de' ? 'Jetzt Upgraden' : 'Upgrade Now')}
                    </Button>
                  )}
                  
                  {isCurrent && (
                    <Button disabled className="w-full bg-white/20">
                      {language === 'bg' ? 'Текущ План' : language === 'de' ? 'Aktueller Plan' : 'Current Plan'}
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Benefits Comparison */}
        <Card className="bg-slate-900/50 border-slate-800 mt-8">
          <CardHeader>
            <CardTitle className="text-white">
              {language === 'bg' ? 'Защо да Надградите?' : language === 'de' ? 'Warum Upgraden?' : 'Why Upgrade?'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                  <TrendingUp className="w-6 h-6 text-blue-400" />
                </div>
                <div>
                  <h3 className="text-white font-semibold mb-2">
                    {language === 'bg' ? 'Увеличени Печалби' : language === 'de' ? 'Erhöhte Gewinne' : 'Increased Profits'}
                  </h3>
                  <p className="text-slate-400 text-sm">
                    {language === 'bg' 
                      ? 'Получете до 25% увеличение на печалбите с висши VIP нива'
                      : language === 'de'
                      ? 'Erhalten Sie bis zu 25% Gewinnsteigerung mit höheren VIP-Stufen'
                      : 'Get up to 25% profit boost with higher VIP tiers'}
                  </p>
                </div>
              </div>
              
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center flex-shrink-0">
                  <Shield className="w-6 h-6 text-purple-400" />
                </div>
                <div>
                  <h3 className="text-white font-semibold mb-2">
                    {language === 'bg' ? 'По-ниски Такси' : language === 'de' ? 'Niedrigere Gebühren' : 'Lower Fees'}
                  </h3>
                  <p className="text-slate-400 text-sm">
                    {language === 'bg' 
                      ? 'Diamond членовете търгуват с 0% такси'
                      : language === 'de'
                      ? 'Diamond-Mitglieder handeln mit 0% Gebühren'
                      : 'Diamond members trade with 0% fees'}
                  </p>
                </div>
              </div>
              
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                  <Zap className="w-6 h-6 text-emerald-400" />
                </div>
                <div>
                  <h3 className="text-white font-semibold mb-2">
                    {language === 'bg' ? 'Ексклузивен Достъп' : language === 'de' ? 'Exklusiver Zugang' : 'Exclusive Access'}
                  </h3>
                  <p className="text-slate-400 text-sm">
                    {language === 'bg' 
                      ? 'Отключете разширени ботове и персонализирани стратегии'
                      : language === 'de'
                      ? 'Schalten Sie erweiterte Bots und benutzerdefinierte Strategien frei'
                      : 'Unlock advanced bots and custom strategies'}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}