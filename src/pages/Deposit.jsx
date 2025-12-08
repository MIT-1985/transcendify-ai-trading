import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DollarSign, CreditCard, Wallet } from 'lucide-react';
import { toast } from 'sonner';

export default function Deposit() {
  const [amount, setAmount] = useState('');
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

  const depositMutation = useMutation({
    mutationFn: async (amount) => {
      const newBalance = (wallet?.balance_tfi || 0) + amount;
      await base44.entities.Wallet.update(wallet.id, {
        balance_tfi: newBalance,
        total_deposited: (wallet?.total_deposited || 0) + amount
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
      toast.success('Deposit successful');
      setAmount('');
    }
  });

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Deposit Funds</h1>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="bg-gradient-to-br from-blue-600 to-blue-500 border-0">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-blue-100 text-sm mb-1">Current Balance</div>
                  <div className="text-3xl font-bold text-white">{wallet?.balance_tfi?.toFixed(2) || '0.00'} TFI</div>
                </div>
                <Wallet className="w-12 h-12 text-blue-200" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader>
              <CardTitle className="text-white">Quick Deposit</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                type="number"
                placeholder="Enter amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="bg-slate-800 border-slate-700"
              />
              <Button
                onClick={() => depositMutation.mutate(Number(amount))}
                disabled={!amount || depositMutation.isPending}
                className="w-full bg-blue-600 hover:bg-blue-500"
              >
                <DollarSign className="w-4 h-4 mr-2" />
                {depositMutation.isPending ? 'Processing...' : 'Deposit Now'}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}