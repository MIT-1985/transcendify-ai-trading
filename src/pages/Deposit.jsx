import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Copy, Wallet, CreditCard, QrCode, ExternalLink, CheckCircle2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

const PAYMENT_ADDRESSES = {
  ERC20: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb5',
  TRC20: 'TXYZabcd1234567890TRON',
  POLYGON: '0x8E3FEF2C2BaF123456789POLYGON',
};

export default function Deposit() {
  const [amount, setAmount] = useState('100');
  const [selectedNetwork, setSelectedNetwork] = useState('ERC20');
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
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
        return await base44.entities.Wallet.create({});
      }
      return wallets[0];
    },
    enabled: !!user?.email
  });

  const depositMutation = useMutation({
    mutationFn: async (depositData) => {
      await base44.entities.Transaction.create({
        type: 'deposit',
        amount: parseFloat(amount),
        currency: 'TFI',
        status: 'pending',
        description: `Deposit via ${depositData.method}`,
        reference: depositData.txHash || 'manual',
        timestamp: new Date().toISOString()
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
      toast.success('Deposit request submitted! Processing...');
      setShowConfirmDialog(false);
    }
  });

  const copyAddress = (address) => {
    navigator.clipboard.writeText(address);
    toast.success('Address copied to clipboard');
  };

  const openBinancePay = () => {
    const tfiAmount = parseFloat(amount) || 100;
    toast.info('Opening Binance Pay... (Demo - would redirect to actual payment)');
    setTimeout(() => {
      depositMutation.mutate({ method: 'Binance Pay', txHash: 'BINANCE_' + Date.now() });
    }, 2000);
  };

  const confirmCryptoDeposit = () => {
    depositMutation.mutate({ 
      method: selectedNetwork, 
      txHash: 'PENDING_' + Date.now() 
    });
  };

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Deposit Funds</h1>
          <p className="text-slate-400">Add TFI tokens to your wallet via multiple payment methods</p>
        </div>

        {/* Current Balance */}
        {wallet && (
          <Card className="bg-gradient-to-br from-blue-600 to-purple-600 border-0 mb-8">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-white/70 mb-1">Current Balance</div>
                  <div className="text-4xl font-bold">{wallet.balance_tfi?.toLocaleString() || 0} TFI</div>
                  <div className="text-sm text-white/70 mt-1">≈ ${wallet.balance_usd?.toLocaleString() || 0} USD</div>
                </div>
                <Wallet className="w-16 h-16 text-white/30" />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Amount Input */}
        <Card className="bg-slate-900/50 border-slate-800 mb-6">
          <CardHeader>
            <CardTitle>Deposit Amount</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4 flex-wrap">
              <Input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Enter amount"
                className="bg-slate-800 border-slate-700 text-white text-lg flex-1"
              />
              <div className="flex gap-2">
                {['50', '100', '500', '1000'].map((val) => (
                  <Button
                    key={val}
                    variant="outline"
                    onClick={() => setAmount(val)}
                    className="border-slate-700"
                  >
                    ${val}
                  </Button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Payment Methods */}
        <Tabs defaultValue="crypto" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2 bg-slate-900/50">
            <TabsTrigger value="crypto">Crypto Deposit</TabsTrigger>
            <TabsTrigger value="binance">Binance Pay</TabsTrigger>
          </TabsList>

          {/* Crypto Networks */}
          <TabsContent value="crypto" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {Object.entries(PAYMENT_ADDRESSES).map(([network, address]) => (
                <Card
                  key={network}
                  className={`cursor-pointer transition-all ${
                    selectedNetwork === network
                      ? 'bg-blue-600/20 border-blue-500'
                      : 'bg-slate-900/50 border-slate-800 hover:border-blue-500/50'
                  }`}
                  onClick={() => setSelectedNetwork(network)}
                >
                  <CardContent className="p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                        <Wallet className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <div className="font-semibold">{network}</div>
                        <div className="text-xs text-slate-400">
                          {network === 'ERC20' && 'Ethereum'}
                          {network === 'TRC20' && 'TRON'}
                          {network === 'POLYGON' && 'Polygon'}
                        </div>
                      </div>
                    </div>
                    {selectedNetwork === network && (
                      <CheckCircle2 className="w-5 h-5 text-blue-400 ml-auto" />
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Selected Network Details */}
            <Card className="bg-slate-900/50 border-slate-800">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <QrCode className="w-5 h-5" />
                  {selectedNetwork} Deposit Address
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="text-sm text-slate-400 mb-2">Send USDT to this address:</div>
                  <div className="flex gap-2">
                    <Input
                      value={PAYMENT_ADDRESSES[selectedNetwork]}
                      readOnly
                      className="bg-slate-800 border-slate-700 text-white font-mono"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => copyAddress(PAYMENT_ADDRESSES[selectedNetwork])}
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4">
                  <div className="text-sm text-amber-400 font-medium mb-2">⚠️ Important Instructions:</div>
                  <ul className="text-xs text-slate-300 space-y-1">
                    <li>• Send only USDT on {selectedNetwork} network</li>
                    <li>• Minimum deposit: $10 USDT</li>
                    <li>• Deposits are credited after 12 confirmations</li>
                    <li>• 1 USDT = 1 TFI token</li>
                  </ul>
                </div>

                <Button 
                  className="w-full bg-blue-600 hover:bg-blue-500"
                  onClick={() => setShowConfirmDialog(true)}
                >
                  I've Sent the Crypto
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Binance Pay */}
          <TabsContent value="binance" className="space-y-4">
            <Card className="bg-gradient-to-br from-amber-600/20 to-orange-600/20 border-amber-500/30">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-amber-400" />
                  Binance Pay
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-slate-300">
                  Pay instantly with Binance Pay. Fast, secure, and no fees.
                </p>

                <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-800">
                  <div className="flex justify-between mb-2">
                    <span className="text-slate-400">You send:</span>
                    <span className="font-semibold">${amount} USDT</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">You receive:</span>
                    <span className="font-semibold text-emerald-400">{amount} TFI</span>
                  </div>
                </div>

                <Button
                  onClick={openBinancePay}
                  className="w-full bg-amber-500 hover:bg-amber-600 text-black font-semibold text-lg py-6"
                  disabled={depositMutation.isPending}
                >
                  <CreditCard className="w-5 h-5 mr-2" />
                  {depositMutation.isPending ? 'Processing...' : 'Pay with Binance Pay'}
                </Button>

                <div className="text-xs text-slate-500 text-center">
                  You will be redirected to Binance Pay to complete the transaction
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Manual Verification Note */}
        <Card className="bg-blue-500/10 border-blue-500/20 mt-6">
          <CardContent className="p-4">
            <div className="text-sm text-blue-300">
              💡 <strong>Manual Verification:</strong> After sending crypto, contact support with your transaction hash for faster processing.
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Confirmation Dialog */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent className="bg-slate-900 border-slate-700 text-white">
          <DialogHeader>
            <DialogTitle>Confirm Crypto Deposit</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-slate-800/50 rounded-lg p-4">
              <div className="text-sm text-slate-400 mb-2">Network:</div>
              <div className="font-semibold">{selectedNetwork}</div>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-4">
              <div className="text-sm text-slate-400 mb-2">Amount:</div>
              <div className="font-semibold">{amount} USDT → {amount} TFI</div>
            </div>
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 text-sm text-amber-300">
              <AlertCircle className="w-4 h-4 inline mr-2" />
              Deposits are manually verified. Processing may take 10-30 minutes.
            </div>
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => setShowConfirmDialog(false)}
                className="flex-1 border-slate-700"
              >
                Cancel
              </Button>
              <Button
                onClick={confirmCryptoDeposit}
                disabled={depositMutation.isPending}
                className="flex-1 bg-blue-600 hover:bg-blue-500"
              >
                {depositMutation.isPending ? 'Submitting...' : 'Confirm Deposit'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}