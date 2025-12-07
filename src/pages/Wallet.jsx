import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Wallet as WalletIcon, ArrowUpRight, ArrowDownLeft, Zap, Crown, TrendingUp, History, Plus } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

const VIP_LEVELS = {
  none: { color: 'text-slate-400', bg: 'bg-slate-500/20', requirement: 0 },
  bronze: { color: 'text-amber-600', bg: 'bg-amber-500/20', requirement: 1000 },
  silver: { color: 'text-slate-300', bg: 'bg-slate-400/20', requirement: 5000 },
  gold: { color: 'text-amber-400', bg: 'bg-amber-400/20', requirement: 10000 },
  platinum: { color: 'text-purple-400', bg: 'bg-purple-500/20', requirement: 50000 },
  diamond: { color: 'text-blue-400', bg: 'bg-blue-500/20', requirement: 100000 }
};

export default function Wallet() {
  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [showDeposit, setShowDeposit] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);

  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me()
  });

  const { data: wallet } = useQuery({
    queryKey: ['wallet', user?.email],
    queryFn: async () => {
      const wallets = await base44.entities.Wallet.filter({ created_by: user.email });
      if (wallets.length === 0) {
        return base44.entities.Wallet.create({
          balance_tfi: 10000,
          balance_usd: 0,
          total_deposited: 10000,
          total_withdrawn: 0,
          total_earned: 0,
          fuel_tokens: 1000,
          vip_level: 'bronze'
        });
      }
      return wallets[0];
    },
    enabled: !!user
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ['transactions', user?.email],
    queryFn: () => base44.entities.Transaction.filter({ created_by: user.email }, '-created_date', 50),
    enabled: !!user
  });

  const depositMutation = useMutation({
    mutationFn: async (amount) => {
      const transaction = await base44.entities.Transaction.create({
        type: 'deposit',
        amount: parseFloat(amount),
        currency: 'TFI',
        status: 'completed',
        description: 'Deposit to wallet',
        timestamp: new Date().toISOString()
      });

      await base44.entities.Wallet.update(wallet.id, {
        balance_tfi: wallet.balance_tfi + parseFloat(amount),
        total_deposited: wallet.total_deposited + parseFloat(amount)
      });

      return transaction;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      toast.success('Deposit successful!');
      setShowDeposit(false);
      setDepositAmount('');
    }
  });

  const withdrawMutation = useMutation({
    mutationFn: async (amount) => {
      if (parseFloat(amount) > wallet.balance_tfi) {
        throw new Error('Insufficient balance');
      }

      const transaction = await base44.entities.Transaction.create({
        type: 'withdrawal',
        amount: parseFloat(amount),
        currency: 'TFI',
        status: 'completed',
        description: 'Withdrawal from wallet',
        timestamp: new Date().toISOString()
      });

      await base44.entities.Wallet.update(wallet.id, {
        balance_tfi: wallet.balance_tfi - parseFloat(amount),
        total_withdrawn: wallet.total_withdrawn + parseFloat(amount)
      });

      return transaction;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      toast.success('Withdrawal successful!');
      setShowWithdraw(false);
      setWithdrawAmount('');
    },
    onError: (error) => {
      toast.error(error.message);
    }
  });

  const vipLevel = wallet?.vip_level || 'none';
  const vipConfig = VIP_LEVELS[vipLevel];

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
              <WalletIcon className="w-5 h-5 text-emerald-400" />
            </div>
            <h1 className="text-3xl font-bold">Wallet</h1>
          </div>
          <p className="text-slate-400">Manage your funds and transactions</p>
        </div>

        {/* Balance Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Card className="bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 border-emerald-500/20 p-6">
            <div className="flex items-center justify-between mb-4">
              <span className="text-slate-400">TFI Balance</span>
              <WalletIcon className="w-5 h-5 text-emerald-400" />
            </div>
            <div className="text-3xl font-bold text-emerald-400 mb-2">
              {wallet?.balance_tfi?.toLocaleString() || 0} TFI
            </div>
            <div className="text-sm text-slate-500">≈ ${(wallet?.balance_tfi * 0.5 || 0).toFixed(2)} USD</div>
          </Card>

          <Card className="bg-gradient-to-br from-purple-500/10 to-purple-600/5 border-purple-500/20 p-6">
            <div className="flex items-center justify-between mb-4">
              <span className="text-slate-400">Fuel Tokens</span>
              <Zap className="w-5 h-5 text-purple-400" />
            </div>
            <div className="text-3xl font-bold text-purple-400 mb-2">
              {wallet?.fuel_tokens?.toLocaleString() || 0}
            </div>
            <div className="text-sm text-slate-500">For bot operations</div>
          </Card>

          <Card className={cn("border p-6", vipConfig.bg, `border-${vipConfig.color.split('-')[1]}-500/20`)}>
            <div className="flex items-center justify-between mb-4">
              <span className="text-slate-400">VIP Status</span>
              <Crown className={cn("w-5 h-5", vipConfig.color)} />
            </div>
            <div className={cn("text-3xl font-bold mb-2 capitalize", vipConfig.color)}>
              {vipLevel}
            </div>
            <div className="text-sm text-slate-500">
              {wallet?.balance_tfi < VIP_LEVELS.diamond.requirement && (
                <>Next: {Object.entries(VIP_LEVELS).find(([k, v]) => v.requirement > wallet.balance_tfi)?.[0]}</>
              )}
            </div>
          </Card>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-4 mb-8">
          <Button
            onClick={() => setShowDeposit(true)}
            className="bg-emerald-600 hover:bg-emerald-500 gap-2 flex-1"
          >
            <ArrowDownLeft className="w-4 h-4" />
            Deposit
          </Button>
          <Button
            onClick={() => setShowWithdraw(true)}
            variant="outline"
            className="border-slate-700 flex-1 gap-2"
          >
            <ArrowUpRight className="w-4 h-4" />
            Withdraw
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Card className="bg-slate-900/50 border-slate-800 p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-slate-400 mb-1">Total Deposited</div>
                <div className="text-xl font-bold text-white">
                  {wallet?.total_deposited?.toLocaleString() || 0} TFI
                </div>
              </div>
              <ArrowDownLeft className="w-5 h-5 text-emerald-400" />
            </div>
          </Card>

          <Card className="bg-slate-900/50 border-slate-800 p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-slate-400 mb-1">Total Earned</div>
                <div className="text-xl font-bold text-emerald-400">
                  +{wallet?.total_earned?.toLocaleString() || 0} TFI
                </div>
              </div>
              <TrendingUp className="w-5 h-5 text-emerald-400" />
            </div>
          </Card>

          <Card className="bg-slate-900/50 border-slate-800 p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-slate-400 mb-1">Total Withdrawn</div>
                <div className="text-xl font-bold text-white">
                  {wallet?.total_withdrawn?.toLocaleString() || 0} TFI
                </div>
              </div>
              <ArrowUpRight className="w-5 h-5 text-slate-400" />
            </div>
          </Card>
        </div>

        {/* Transaction History */}
        <Card className="bg-slate-900/50 border-slate-800 p-6">
          <div className="flex items-center gap-2 mb-6">
            <History className="w-5 h-5 text-slate-400" />
            <h2 className="text-xl font-semibold">Transaction History</h2>
          </div>

          <div className="space-y-3">
            {transactions.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                No transactions yet
              </div>
            ) : (
              transactions.map((tx) => (
                <div key={tx.id} className="flex items-center justify-between p-4 bg-slate-800/30 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-10 h-10 rounded-lg flex items-center justify-center",
                      tx.type === 'deposit' ? 'bg-emerald-500/20' : 
                      tx.type === 'withdrawal' ? 'bg-orange-500/20' :
                      'bg-blue-500/20'
                    )}>
                      {tx.type === 'deposit' ? <ArrowDownLeft className="w-5 h-5 text-emerald-400" /> :
                       tx.type === 'withdrawal' ? <ArrowUpRight className="w-5 h-5 text-orange-400" /> :
                       <TrendingUp className="w-5 h-5 text-blue-400" />}
                    </div>
                    <div>
                      <div className="font-medium capitalize">{tx.type.replace('_', ' ')}</div>
                      <div className="text-sm text-slate-500">
                        {tx.timestamp ? format(new Date(tx.timestamp), 'MMM d, yyyy HH:mm') : 
                         format(new Date(tx.created_date), 'MMM d, yyyy HH:mm')}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={cn(
                      "text-lg font-semibold",
                      tx.type === 'deposit' || tx.type === 'commission' || tx.type === 'bot_profit' 
                        ? 'text-emerald-400' 
                        : 'text-white'
                    )}>
                      {tx.type === 'deposit' || tx.type === 'commission' || tx.type === 'bot_profit' ? '+' : '-'}
                      {tx.amount.toLocaleString()} {tx.currency}
                    </div>
                    <div className="text-sm text-slate-500 capitalize">{tx.status}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        {/* Deposit Dialog */}
        <Dialog open={showDeposit} onOpenChange={setShowDeposit}>
          <DialogContent className="bg-slate-900 border-slate-700 text-white">
            <DialogHeader>
              <DialogTitle>Deposit TFI</DialogTitle>
              <DialogDescription className="text-slate-400">
                Add TFI tokens to your wallet
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Amount (TFI)</Label>
                <Input
                  type="number"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  placeholder="1000"
                  className="bg-slate-800 border-slate-700"
                />
              </div>
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setShowDeposit(false)} className="flex-1">
                  Cancel
                </Button>
                <Button
                  onClick={() => depositMutation.mutate(depositAmount)}
                  disabled={!depositAmount || depositMutation.isPending}
                  className="bg-emerald-600 hover:bg-emerald-500 flex-1"
                >
                  {depositMutation.isPending ? 'Processing...' : 'Deposit'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Withdraw Dialog */}
        <Dialog open={showWithdraw} onOpenChange={setShowWithdraw}>
          <DialogContent className="bg-slate-900 border-slate-700 text-white">
            <DialogHeader>
              <DialogTitle>Withdraw TFI</DialogTitle>
              <DialogDescription className="text-slate-400">
                Withdraw TFI tokens from your wallet
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Amount (TFI)</Label>
                <Input
                  type="number"
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  placeholder="100"
                  max={wallet?.balance_tfi || 0}
                  className="bg-slate-800 border-slate-700"
                />
                <div className="text-sm text-slate-500">
                  Available: {wallet?.balance_tfi?.toLocaleString() || 0} TFI
                </div>
              </div>
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setShowWithdraw(false)} className="flex-1">
                  Cancel
                </Button>
                <Button
                  onClick={() => withdrawMutation.mutate(withdrawAmount)}
                  disabled={!withdrawAmount || withdrawMutation.isPending}
                  className="bg-orange-600 hover:bg-orange-500 flex-1"
                >
                  {withdrawMutation.isPending ? 'Processing...' : 'Withdraw'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}