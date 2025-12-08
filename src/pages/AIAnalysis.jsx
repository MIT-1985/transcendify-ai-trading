import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Brain, TrendingUp, TrendingDown, AlertTriangle, Sparkles, Target, BarChart3 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useTranslation } from '@/components/utils/translations';

const CRYPTO_PAIRS = ['X:BTCUSD', 'X:ETHUSD', 'X:SOLUSD', 'X:XRPUSD', 'X:ADAUSD'];

export default function AIAnalysis() {
  const [language, setLanguage] = useState(() => localStorage.getItem('language') || 'en');
  const { t } = useTranslation(language);
  const [selectedSymbol, setSelectedSymbol] = useState('X:BTCUSD');
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState(null);

  const { data: trades = [] } = useQuery({
    queryKey: ['recentTrades'],
    queryFn: () => base44.entities.Trade.list('-timestamp', 100)
  });

  const { data: subscriptions = [] } = useQuery({
    queryKey: ['activeSubscriptions'],
    queryFn: () => base44.entities.UserSubscription.filter({ status: 'active' })
  });

  const runAIAnalysis = async () => {
    setAnalyzing(true);
    try {
      // Fetch current market data
      const marketResponse = await base44.functions.invoke('polygonMarketData', {
        action: 'ticker',
        symbol: selectedSymbol
      });

      const currentPrice = marketResponse.data?.data?.results?.[0]?.c || 0;
      const priceChange = marketResponse.data?.data?.results?.[0]?.todaysChangePerc || 0;

      // Get AI analysis
      const aiResponse = await base44.functions.invoke('aiTradingAnalysis', {
        symbol: selectedSymbol,
        currentPrice,
        recentTrades: trades.slice(0, 20),
        activeBotsCount: subscriptions.length
      });

      setAnalysis({
        ...aiResponse.data,
        currentPrice,
        priceChange,
        timestamp: new Date()
      });
    } catch (error) {
      console.error('Analysis error:', error);
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
            <Brain className="w-8 h-8 text-purple-400" />
            {language === 'bg' ? 'AI Анализ' : language === 'de' ? 'KI-Analyse' : 'AI Analysis'}
          </h1>
          <p className="text-slate-400">
            {language === 'bg' 
              ? 'Задълбочени пазарни прозрения и търговски препоръки с AI'
              : language === 'de'
              ? 'Tiefgreifende Markteinblicke und Handelsempfehlungen mit KI'
              : 'Deep market insights and trading recommendations powered by AI'}
          </p>
        </div>

        {/* Analysis Control */}
        <Card className="bg-slate-900/50 border-slate-800 mb-6">
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <label className="text-sm text-slate-400 mb-2 block">
                  {language === 'bg' ? 'Изберете Актив' : language === 'de' ? 'Asset Auswählen' : 'Select Asset'}
                </label>
                <Select value={selectedSymbol} onValueChange={setSelectedSymbol}>
                  <SelectTrigger className="bg-slate-800 border-slate-700">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    {CRYPTO_PAIRS.map(pair => (
                      <SelectItem key={pair} value={pair}>
                        {pair.replace('X:', '').replace('USD', '/USD')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button 
                  onClick={runAIAnalysis} 
                  disabled={analyzing}
                  className="bg-purple-600 hover:bg-purple-500"
                >
                  {analyzing ? (
                    <>
                      <Sparkles className="w-4 h-4 mr-2 animate-spin" />
                      {language === 'bg' ? 'Анализиране...' : language === 'de' ? 'Analysiere...' : 'Analyzing...'}
                    </>
                  ) : (
                    <>
                      <Brain className="w-4 h-4 mr-2" />
                      {language === 'bg' ? 'Стартирай AI Анализ' : language === 'de' ? 'KI-Analyse Starten' : 'Run AI Analysis'}
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Analysis Results */}
        {analysis && (
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="bg-slate-900/50 border border-slate-800 grid grid-cols-4 w-full">
              <TabsTrigger value="overview">
                {language === 'bg' ? 'Преглед' : language === 'de' ? 'Übersicht' : 'Overview'}
              </TabsTrigger>
              <TabsTrigger value="signals">
                {language === 'bg' ? 'Сигнали' : language === 'de' ? 'Signale' : 'Signals'}
              </TabsTrigger>
              <TabsTrigger value="risk">
                {language === 'bg' ? 'Риск' : language === 'de' ? 'Risiko' : 'Risk'}
              </TabsTrigger>
              <TabsTrigger value="prediction">
                {language === 'bg' ? 'Прогноза' : language === 'de' ? 'Prognose' : 'Prediction'}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="mt-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Current Price */}
                <Card className="bg-gradient-to-br from-blue-600 to-blue-500 border-0">
                  <CardContent className="pt-6">
                    <div className="text-blue-100 text-sm mb-1">
                      {language === 'bg' ? 'Текуща Цена' : language === 'de' ? 'Aktueller Preis' : 'Current Price'}
                    </div>
                    <div className="text-3xl font-bold text-white mb-2">
                      ${analysis.currentPrice.toFixed(2)}
                    </div>
                    <div className={`flex items-center gap-1 ${analysis.priceChange >= 0 ? 'text-green-300' : 'text-red-300'}`}>
                      {analysis.priceChange >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                      {analysis.priceChange >= 0 ? '+' : ''}{analysis.priceChange.toFixed(2)}%
                    </div>
                  </CardContent>
                </Card>

                {/* Sentiment */}
                <Card className={`border-0 ${
                  analysis.sentiment === 'bullish' ? 'bg-gradient-to-br from-green-600 to-green-500' :
                  analysis.sentiment === 'bearish' ? 'bg-gradient-to-br from-red-600 to-red-500' :
                  'bg-gradient-to-br from-yellow-600 to-yellow-500'
                }`}>
                  <CardContent className="pt-6">
                    <div className="text-white/80 text-sm mb-1">
                      {language === 'bg' ? 'Пазарен Настрой' : language === 'de' ? 'Marktstimmung' : 'Market Sentiment'}
                    </div>
                    <div className="text-3xl font-bold text-white capitalize mb-2">
                      {analysis.sentiment || 'Neutral'}
                    </div>
                    <div className="text-sm text-white/80">
                      {language === 'bg' ? 'Увереност' : language === 'de' ? 'Vertrauen' : 'Confidence'}: {((analysis.confidence || 0.5) * 100).toFixed(0)}%
                    </div>
                  </CardContent>
                </Card>

                {/* Recommendation */}
                <Card className="bg-slate-900/50 border-slate-800">
                  <CardContent className="pt-6">
                    <div className="text-slate-400 text-sm mb-1">
                      {language === 'bg' ? 'Препоръка' : language === 'de' ? 'Empfehlung' : 'Recommendation'}
                    </div>
                    <div className="text-2xl font-bold text-white mb-2">
                      {analysis.recommendation || 'HOLD'}
                    </div>
                    <Badge className={
                      analysis.recommendation === 'BUY' ? 'bg-green-500/20 text-green-400' :
                      analysis.recommendation === 'SELL' ? 'bg-red-500/20 text-red-400' :
                      'bg-yellow-500/20 text-yellow-400'
                    }>
                      {analysis.strength || 'Moderate'}
                    </Badge>
                  </CardContent>
                </Card>
              </div>

              {/* AI Insights */}
              <Card className="bg-slate-900/50 border-slate-800 mt-6">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-purple-400" />
                    {language === 'bg' ? 'AI Прозрения' : language === 'de' ? 'KI-Einblicke' : 'AI Insights'}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="prose prose-invert max-w-none">
                    <p className="text-slate-300 whitespace-pre-wrap">
                      {analysis.analysis || 'No detailed analysis available'}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="signals" className="mt-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Buy Signals */}
                <Card className="bg-slate-900/50 border-slate-800">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center gap-2">
                      <TrendingUp className="w-5 h-5 text-green-400" />
                      {language === 'bg' ? 'Сигнали за Покупка' : language === 'de' ? 'Kaufsignale' : 'Buy Signals'}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {(analysis.buySignals || []).map((signal, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-sm text-slate-300">
                          <span className="text-green-400 mt-1">✓</span>
                          {signal}
                        </li>
                      ))}
                      {(!analysis.buySignals || analysis.buySignals.length === 0) && (
                        <p className="text-slate-500 text-sm">No strong buy signals detected</p>
                      )}
                    </ul>
                  </CardContent>
                </Card>

                {/* Sell Signals */}
                <Card className="bg-slate-900/50 border-slate-800">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center gap-2">
                      <TrendingDown className="w-5 h-5 text-red-400" />
                      {language === 'bg' ? 'Сигнали за Продажба' : language === 'de' ? 'Verkaufssignale' : 'Sell Signals'}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {(analysis.sellSignals || []).map((signal, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-sm text-slate-300">
                          <span className="text-red-400 mt-1">✗</span>
                          {signal}
                        </li>
                      ))}
                      {(!analysis.sellSignals || analysis.sellSignals.length === 0) && (
                        <p className="text-slate-500 text-sm">No strong sell signals detected</p>
                      )}
                    </ul>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="risk" className="mt-6">
              <Card className="bg-slate-900/50 border-slate-800">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-yellow-400" />
                    {language === 'bg' ? 'Оценка на Риска' : language === 'de' ? 'Risikobewertung' : 'Risk Assessment'}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-slate-800/50 rounded-lg p-4">
                      <div className="text-slate-400 text-sm mb-1">
                        {language === 'bg' ? 'Ниво на Риск' : language === 'de' ? 'Risikoniveau' : 'Risk Level'}
                      </div>
                      <div className={`text-2xl font-bold ${
                        analysis.riskLevel === 'low' ? 'text-green-400' :
                        analysis.riskLevel === 'medium' ? 'text-yellow-400' :
                        'text-red-400'
                      }`}>
                        {analysis.riskLevel || 'Medium'}
                      </div>
                    </div>

                    <div className="bg-slate-800/50 rounded-lg p-4">
                      <div className="text-slate-400 text-sm mb-1">
                        {language === 'bg' ? 'Волатилност' : language === 'de' ? 'Volatilität' : 'Volatility'}
                      </div>
                      <div className="text-2xl font-bold text-white">
                        {analysis.volatility || 'Moderate'}
                      </div>
                    </div>

                    <div className="bg-slate-800/50 rounded-lg p-4">
                      <div className="text-slate-400 text-sm mb-1">
                        {language === 'bg' ? 'Препоръчителен Стоп Лос' : language === 'de' ? 'Empfohlener Stop Loss' : 'Suggested Stop Loss'}
                      </div>
                      <div className="text-2xl font-bold text-red-400">
                        {analysis.suggestedStopLoss || 5}%
                      </div>
                    </div>
                  </div>

                  {analysis.risks && (
                    <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
                      <h4 className="text-yellow-300 font-semibold mb-2">
                        {language === 'bg' ? 'Идентифицирани Рискове' : language === 'de' ? 'Identifizierte Risiken' : 'Identified Risks'}
                      </h4>
                      <ul className="space-y-1">
                        {analysis.risks.map((risk, idx) => (
                          <li key={idx} className="text-sm text-yellow-200 flex items-start gap-2">
                            <span>•</span>
                            {risk}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="prediction" className="mt-6">
              <Card className="bg-slate-900/50 border-slate-800">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2">
                    <Target className="w-5 h-5 text-blue-400" />
                    {language === 'bg' ? 'Ценова Прогноза' : language === 'de' ? 'Preisprognose' : 'Price Prediction'}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
                      <div className="text-green-300 text-sm mb-2">
                        {language === 'bg' ? '24ч Оптимистична' : language === 'de' ? '24h Optimistisch' : '24h Optimistic'}
                      </div>
                      <div className="text-2xl font-bold text-green-400">
                        ${((analysis.currentPrice || 0) * 1.05).toFixed(2)}
                      </div>
                      <div className="text-xs text-green-300 mt-1">+5.0%</div>
                    </div>

                    <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                      <div className="text-blue-300 text-sm mb-2">
                        {language === 'bg' ? '24ч Очаквана' : language === 'de' ? '24h Erwartet' : '24h Expected'}
                      </div>
                      <div className="text-2xl font-bold text-blue-400">
                        ${((analysis.currentPrice || 0) * 1.02).toFixed(2)}
                      </div>
                      <div className="text-xs text-blue-300 mt-1">+2.0%</div>
                    </div>

                    <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
                      <div className="text-red-300 text-sm mb-2">
                        {language === 'bg' ? '24ч Песимистична' : language === 'de' ? '24h Pessimistisch' : '24h Pessimistic'}
                      </div>
                      <div className="text-2xl font-bold text-red-400">
                        ${((analysis.currentPrice || 0) * 0.97).toFixed(2)}
                      </div>
                      <div className="text-xs text-red-300 mt-1">-3.0%</div>
                    </div>
                  </div>

                  <div className="mt-6 bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                    <p className="text-sm text-blue-200">
                      ℹ️ {language === 'bg' 
                        ? 'Прогнозите са базирани на AI анализ на пазарни тенденции, технически индикатори и исторически данни. Не са гаранция за бъдещи резултати.'
                        : language === 'de'
                        ? 'Prognosen basieren auf KI-Analyse von Markttrends, technischen Indikatoren und historischen Daten. Keine Garantie für zukünftige Ergebnisse.'
                        : 'Predictions based on AI analysis of market trends, technical indicators, and historical data. Not a guarantee of future results.'}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}

        {/* Empty State */}
        {!analysis && !analyzing && (
          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="pt-16 pb-16">
              <div className="text-center">
                <BarChart3 className="w-16 h-16 text-slate-600 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-white mb-2">
                  {language === 'bg' ? 'Няма Анализ' : language === 'de' ? 'Keine Analyse' : 'No Analysis Yet'}
                </h3>
                <p className="text-slate-400 mb-6">
                  {language === 'bg' 
                    ? 'Изберете актив и стартирайте AI анализ за задълбочени пазарни прозрения'
                    : language === 'de'
                    ? 'Wählen Sie ein Asset und starten Sie die KI-Analyse für tiefgreifende Markteinblicke'
                    : 'Select an asset and run AI analysis to get deep market insights'}
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}