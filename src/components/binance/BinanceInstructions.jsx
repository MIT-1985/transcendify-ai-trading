import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Info } from 'lucide-react';

export default function BinanceInstructions() {
  const steps = [
    { text: <>Отидете в <a href="https://www.binance.com/en/my/settings/api-management" target="_blank" rel="noopener" className="text-blue-400 underline">Binance API Management</a></> },
    { text: 'Кликнете "Create API" и изберете "System generated"' },
    { text: <>Активирайте <strong className="text-white">Spot Trading</strong> разрешение</> },
    { text: 'Ограничете до вашия IP за сигурност (препоръчва се)' },
    { text: 'Копирайте API Key и Secret и ги поставете по-горе' },
  ];

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <CardTitle className="text-white text-base flex items-center gap-2">
          <Info className="w-5 h-5 text-blue-400" />
          Как да създадете Binance API Key
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {steps.map((step, i) => (
          <div key={i} className="flex gap-3 text-sm text-slate-400">
            <span className="w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-xs font-bold shrink-0">
              {i + 1}
            </span>
            <span>{step.text}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}