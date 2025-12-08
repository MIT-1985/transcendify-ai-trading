import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Copy, Calendar, DollarSign, Sparkles, AlertCircle } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

export default function CloneBotModal({ subscription, botInfo, isOpen, onClose }) {
  const queryClient = useQueryClient();
  const [clonePrice, setClonePrice] = useState(0);
  const [discount, setDiscount] = useState(0);

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me(),
    enabled: isOpen
  });

  const { data: wallet } = useQuery({
    queryKey: ['wallet'],
    queryFn: async () => {
      return base44.entities.Wallet.filter({ created_by: user.email }).then(w => w[0]);
    },
    enabled: isOpen && !!user
  });

  const { data: cloneCount = 0 } = useQuery({
    queryKey: ['cloneCount', subscription?.id],
    queryFn: async () => {
      if (!subscription) return 0;
      // Брой клонирания от този оригинален бот
      const allSubs = await base44.entities.UserSubscription.filter({ 
        bot_id: subscription.bot_id,
        created_by: user.email
      });
      // Брои само клониранията (без оригиналния)
      return allSubs.length - 1;
    },
    enabled: isOpen && !!subscription && !!user
  });

  useEffect(() => {
    if (!subscription || !botInfo) return;

    // Изчисли възраст на бота в месеци
    const startDate = new Date(subscription.start_date || subscription.created_date);
    const now = new Date();
    const ageInMonths = (now - startDate) / (1000 * 60 * 60 * 24 * 30);

    // Определи отстъпка базирана на възраст
    let discountPercent = 0;
    if (ageInMonths >= 6) {
      discountPercent = 50;
    } else if (ageInMonths >= 3) {
      discountPercent = 30;
    } else if (ageInMonths >= 1) {
      discountPercent = 20;
    }

    setDiscount(discountPercent);

    // Изчисли цена (базова цена на бота минус отстъпка)
    const basePrice = botInfo.price || 299;
    const finalPrice = basePrice * (1 - discountPercent / 100);
    setClonePrice(finalPrice);
  }, [subscription, botInfo]);

  const cloneMutation = useMutation({
    mutationFn: async () => {
      // Провери собственост
      if (subscription.created_by !== user.email) {
        throw new Error('Можете да клонирате само свои ботове');
      }

      // Провери VIP статус (минимум Bronze)
      if (!wallet || !['bronze', 'silver', 'gold', 'platinum', 'diamond'].includes(wallet.vip_level)) {
        throw new Error('Клонирането изисква минимум Bronze VIP статус');
      }

      // Лимит на клонирания (макс 5 клона на бот)
      if (cloneCount >= 5) {
        throw new Error('Достигнахте максималния лимит от 5 клонирания на този бот');
      }

      // Провери дали има достатъчно средства
      if (!wallet || wallet.balance_tfi < clonePrice) {
        throw new Error('Недостатъчно средства в портфейла');
      }

      // Приспадни средствата
      await base44.entities.Wallet.update(wallet.id, {
        balance_tfi: wallet.balance_tfi - clonePrice
      });

      // Създай транзакция
      await base44.entities.Transaction.create({
        type: 'subscription_payment',
        amount: clonePrice,
        currency: 'TFI',
        status: 'completed',
        description: `Клониране на бот: ${botInfo.name}`,
        timestamp: new Date().toISOString()
      });

      // Клонирай бота
      const { id, created_date, updated_date, created_by, ...config } = subscription;
      await base44.entities.UserSubscription.create({
        ...config,
        status: 'paused',
        total_profit: 0,
        total_trades: 0,
        start_date: new Date().toISOString()
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userSubscriptions'] });
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
      toast.success('Бот клониран успешно!');
      onClose();
    },
    onError: (error) => {
      toast.error(error.message);
    }
  });

  if (!subscription || !botInfo) return null;

  const startDate = new Date(subscription.start_date || subscription.created_date);
  const ageInDays = Math.floor((new Date() - startDate) / (1000 * 60 * 60 * 24));
  const hasEnoughFunds = wallet && wallet.balance_tfi >= clonePrice;
  const isOwner = subscription.created_by === user?.email;
  const isVIP = wallet && ['bronze', 'silver', 'gold', 'platinum', 'diamond'].includes(wallet.vip_level);
  const canClone = isOwner && isVIP && cloneCount < 5 && hasEnoughFunds;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Copy className="w-5 h-5 text-blue-400" />
            Клониране на Бот
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Bot Info */}
          <div className="bg-slate-800/50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="font-semibold">{botInfo.name}</div>
              <Badge variant="outline" className="text-xs">
                {botInfo.strategy}
              </Badge>
            </div>
            <div className="text-sm text-slate-400">
              {subscription.trading_pairs?.join(', ') || 'N/A'}
            </div>
          </div>

          {/* Age & Optimization Info */}
          <div className="bg-blue-900/20 border border-blue-900 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Sparkles className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="font-semibold text-blue-300 mb-1">Оптимизирана Конфигурация</div>
                <div className="text-sm text-blue-200">
                  Този бот работи от <strong>{ageInDays} дни</strong> и съдържа вашите подобрени настройки,
                  AI поведение и оптимизирани параметри.
                </div>
              </div>
            </div>
          </div>

          {/* Pricing */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-400">Базова цена:</span>
              <span className="line-through text-slate-500">${botInfo.price || 299} TFI</span>
            </div>
            
            {discount > 0 && (
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-green-400" />
                  <span className="text-green-400">Отстъпка ({ageInDays} дни):</span>
                </div>
                <Badge className="bg-green-500/20 text-green-300">-{discount}%</Badge>
              </div>
            )}

            <div className="flex items-center justify-between text-lg font-bold border-t border-slate-700 pt-2">
              <span>Крайна цена:</span>
              <div className="flex items-center gap-1">
                <DollarSign className="w-5 h-5 text-yellow-400" />
                <span className="text-yellow-400">{clonePrice.toFixed(0)} TFI</span>
              </div>
            </div>
          </div>

          {/* VIP Status */}
          <div className="bg-slate-800/50 rounded-lg p-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-400">VIP Статус:</span>
              <Badge className={isVIP ? 'bg-yellow-500/20 text-yellow-300' : 'bg-slate-700 text-slate-400'}>
                {wallet ? wallet.vip_level : 'Зареждане...'}
              </Badge>
            </div>
          </div>

          {/* Clone Count */}
          <div className="bg-slate-800/50 rounded-lg p-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-400">Клонирания:</span>
              <span className={cloneCount >= 5 ? 'text-red-400' : 'text-slate-300'}>
                {cloneCount} / 5
              </span>
            </div>
          </div>

          {/* Wallet Balance */}
          <div className="bg-slate-800/50 rounded-lg p-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-400">Баланс в портфейла:</span>
              <span className={hasEnoughFunds ? 'text-green-400' : 'text-red-400'}>
                {wallet ? `${wallet.balance_tfi.toFixed(2)} TFI` : 'Зареждане...'}
              </span>
            </div>
          </div>

          {/* Warnings */}
          {!isOwner && (
            <div className="bg-red-900/20 border border-red-900 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-red-300">
                  Можете да клонирате само свои ботове.
                </div>
              </div>
            </div>
          )}

          {!isVIP && isOwner && (
            <div className="bg-red-900/20 border border-red-900 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-red-300">
                  Клонирането изисква минимум Bronze VIP статус. Надградете профила си за достъп.
                </div>
              </div>
            </div>
          )}

          {cloneCount >= 5 && isOwner && isVIP && (
            <div className="bg-red-900/20 border border-red-900 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-red-300">
                  Достигнахте максималния лимит от 5 клонирания на този бот.
                </div>
              </div>
            </div>
          )}

          {!hasEnoughFunds && wallet && isOwner && isVIP && cloneCount < 5 && (
            <div className="bg-red-900/20 border border-red-900 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-red-300">
                  Недостатъчно средства. Моля, добавете {(clonePrice - wallet.balance_tfi).toFixed(2)} TFI към портфейла.
                </div>
              </div>
            </div>
          )}

          {/* Discount explanation */}
          {discount === 0 && (
            <div className="text-xs text-slate-500 bg-slate-800/30 rounded p-2">
              💡 Използвайте бота повече от 1 месец за отстъпка при клониране:
              <div className="mt-1 space-y-0.5">
                <div>• 1 месец = 20% отстъпка</div>
                <div>• 3 месеца = 30% отстъпка</div>
                <div>• 6+ месеца = 50% отстъпка</div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <Button
              onClick={onClose}
              variant="outline"
              className="flex-1 border-slate-700"
            >
              Откажи
            </Button>
            <Button
              onClick={() => cloneMutation.mutate()}
              disabled={!canClone || cloneMutation.isPending}
              className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50"
            >
              {cloneMutation.isPending ? 'Клониране...' : 'Клонирай'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}