import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Wifi, WifiOff, Play, Square, Trash2, Terminal, Settings } from 'lucide-react';
import ConsoleOutput from '@/components/trading/ConsoleOutput';
import { cn } from '@/lib/utils';

const ASSET_TYPES = [
  { value: 'stocks', label: 'Stocks', prefix: 'AM' },
  { value: 'crypto', label: 'Crypto', prefix: 'XA' },
  { value: 'forex', label: 'Forex', prefix: 'CA' },
  { value: 'options', label: 'Options', prefix: 'T' }
];

const PRESET_SUBSCRIPTIONS = {
  crypto: 'XA.BTC-USD,XA.ETH-USD,XA.SOL-USD,XA.DOGE-USD',
  stocks: 'AM.AAPL,AM.TSLA,AM.GOOGL,AM.MSFT',
  forex: 'CA.EUR-USD,CA.GBP-USD,CA.USD-JPY',
  options: 'T.O:SPY251219C00600000'
};

export default function PolygonConsole() {
  const [assetType, setAssetType] = useState('crypto');
  const [subscribeParams, setSubscribeParams] = useState(PRESET_SUBSCRIPTIONS.crypto);
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [messages, setMessages] = useState([]);
  const wsRef = useRef(null);

  const handleAssetChange = (value) => {
    setAssetType(value);
    setSubscribeParams(PRESET_SUBSCRIPTIONS[value] || '');
  };

  const connect = useCallback(() => {
    if (!apiKey) {
      setMessages(prev => [...prev, '{"error": "API key is required"}']);
      return;
    }

    const wsUrl = `wss://socket.polygon.io/${assetType}`;
    
    setMessages(prev => [...prev, `{"status": "connecting", "url": "${wsUrl}"}`]);
    
    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setMessages(prev => [...prev, '{"status": "connected", "message": "WebSocket opened"}']);
        
        // Authenticate
        const authMsg = JSON.stringify({ action: 'auth', params: apiKey });
        ws.send(authMsg);
        setMessages(prev => [...prev, `{"action": "auth", "status": "sent"}`]);
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        // Check for successful auth and subscribe
        if (Array.isArray(data)) {
          data.forEach(msg => {
            if (msg.status === 'auth_success') {
              setIsConnected(true);
              setMessages(prev => [...prev, '{"status": "auth_success", "message": "Authentication successful"}']);
              
              // Subscribe to channels
              if (subscribeParams) {
                const subMsg = JSON.stringify({ action: 'subscribe', params: subscribeParams });
                ws.send(subMsg);
                setMessages(prev => [...prev, `{"action": "subscribe", "params": "${subscribeParams}"}`]);
              }
            } else if (msg.status === 'connected') {
              setMessages(prev => [...prev, JSON.stringify(msg)]);
            } else {
              setMessages(prev => [...prev, JSON.stringify(msg)]);
            }
          });
        } else {
          setMessages(prev => [...prev, JSON.stringify(data)]);
        }
      };

      ws.onerror = (error) => {
        setMessages(prev => [...prev, `{"error": "WebSocket error", "details": "${error.message || 'Unknown error'}"}`]);
      };

      ws.onclose = (event) => {
        setIsConnected(false);
        setMessages(prev => [...prev, `{"status": "disconnected", "code": ${event.code}, "reason": "${event.reason || 'Connection closed'}"}`]);
      };
    } catch (error) {
      setMessages(prev => [...prev, `{"error": "${error.message}"}`]);
    }
  }, [apiKey, assetType, subscribeParams]);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
      setIsConnected(false);
    }
  }, []);

  const clearConsole = () => setMessages([]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  // Limit messages
  useEffect(() => {
    if (messages.length > 500) {
      setMessages(prev => prev.slice(-500));
    }
  }, [messages]);

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
              <Terminal className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Polygon Console</h1>
              <p className="text-slate-400 text-sm">Real-time market data WebSocket</p>
            </div>
          </div>
          <Badge 
            className={cn(
              "flex items-center gap-2 px-3 py-1.5",
              isConnected 
                ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" 
                : "bg-slate-700/50 text-slate-400 border-slate-600"
            )}
          >
            {isConnected ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
            {isConnected ? 'Connected' : 'Disconnected'}
          </Badge>
        </div>

        {/* Configuration Panel */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Settings className="w-4 h-4 text-slate-400" />
            <h2 className="font-semibold">Connection Settings</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <div className="space-y-2">
              <Label className="text-slate-400">Asset Type</Label>
              <Select value={assetType} onValueChange={handleAssetChange}>
                <SelectTrigger className="bg-slate-800 border-slate-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  {ASSET_TYPES.map(type => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2 lg:col-span-2">
              <Label className="text-slate-400">Subscribe Parameters</Label>
              <Input
                value={subscribeParams}
                onChange={(e) => setSubscribeParams(e.target.value)}
                placeholder="AM.BTCUSD,AM.ETHUSD"
                className="bg-slate-800 border-slate-700 font-mono text-sm"
              />
            </div>
            
            <div className="space-y-2">
              <Label className="text-slate-400">Polygon API Key</Label>
              <div className="relative">
                <Input
                  type={showApiKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Your API key"
                  className="bg-slate-800 border-slate-700 pr-16"
                />
                <button
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-white"
                >
                  {showApiKey ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button
              onClick={connect}
              disabled={isConnected}
              className="bg-emerald-600 hover:bg-emerald-500 gap-2"
            >
              <Play className="w-4 h-4" />
              Connect & Subscribe
            </Button>
            <Button
              onClick={disconnect}
              disabled={!isConnected}
              variant="outline"
              className="border-slate-700 hover:bg-slate-800 gap-2"
            >
              <Square className="w-4 h-4" />
              Disconnect
            </Button>
            <Button
              onClick={clearConsole}
              variant="ghost"
              className="text-slate-400 hover:text-white gap-2"
            >
              <Trash2 className="w-4 h-4" />
              Clear
            </Button>
          </div>
        </div>

        {/* Console Output */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-slate-400" />
              <span className="text-sm font-medium">Output</span>
              <span className="text-xs text-slate-500">({messages.length} messages)</span>
            </div>
            {isConnected && (
              <span className="flex items-center gap-1 text-xs text-emerald-400">
                <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                Streaming
              </span>
            )}
          </div>
          <ConsoleOutput messages={messages} maxHeight="500px" />
        </div>

        {/* Info Panel */}
        <div className="mt-6 bg-slate-900/30 border border-slate-800 rounded-xl p-4">
          <h3 className="text-sm font-semibold mb-2 text-slate-300">Quick Reference</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs text-slate-400">
            <div>
              <span className="text-blue-400 font-medium">Crypto:</span> XA.BTC-USD, XA.ETH-USD
            </div>
            <div>
              <span className="text-purple-400 font-medium">Stocks:</span> AM.AAPL, AM.TSLA
            </div>
            <div>
              <span className="text-amber-400 font-medium">Forex:</span> CA.EUR-USD, CA.GBP-USD
            </div>
            <div>
              <span className="text-emerald-400 font-medium">Events:</span> AM=Aggregates, T=Trades, Q=Quotes
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}