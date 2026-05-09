import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { ChevronDown, Copy, AlertCircle, CheckCircle2, Clock } from 'lucide-react';
import moment from 'moment';

export default function BotDebugPanel() {
  const [logs, setLogs] = useState([]);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    // Parse console logs to extract bot debug info
    const originalLog = console.log;
    const newLogs = [];
    
    window.console.log = function(...args) {
      const msg = args.join(' ');
      
      // Capture [ROBOT-1] prefixed messages
      if (msg.includes('[ROBOT-1]') || msg.includes('[SKIP]') || msg.includes('[LIVE-OKX]') || msg.includes('[ADAPTIVE]')) {
        newLogs.unshift({
          timestamp: new Date(),
          message: msg,
          type: msg.includes('[SKIP]') ? 'skip' : msg.includes('[LIVE-OKX]') ? 'execution' : 'info'
        });
        if (newLogs.length > 50) newLogs.pop(); // Keep last 50
        setLogs([...newLogs]);
      }
      
      originalLog.apply(console, args);
    };
  }, []);

  const getIcon = (type) => {
    switch(type) {
      case 'skip': return <AlertCircle className="w-4 h-4 text-yellow-400" />;
      case 'execution': return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
      default: return <Clock className="w-4 h-4 text-blue-400" />;
    }
  };

  return (
    <div className="fixed bottom-4 right-4 w-96 bg-slate-900 border border-slate-700 rounded-xl overflow-hidden shadow-2xl z-50">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 bg-slate-800 hover:bg-slate-700 transition-colors"
      >
        <span className="text-sm font-bold text-white flex items-center gap-2">
          🤖 Robot 1 Debug
          <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 text-xs rounded">Live</span>
        </span>
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {/* Logs */}
      {expanded && (
        <div className="max-h-96 overflow-y-auto bg-slate-950 border-t border-slate-700">
          {logs.length === 0 ? (
            <div className="p-4 text-xs text-slate-500 text-center">Waiting for bot activity...</div>
          ) : (
            logs.map((log, i) => (
              <div key={i} className="px-4 py-2 border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                <div className="flex items-start gap-2">
                  {getIcon(log.type)}
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-slate-400">{moment(log.timestamp).format('HH:mm:ss')}</div>
                    <div className="text-xs text-white font-mono break-words">{log.message}</div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}