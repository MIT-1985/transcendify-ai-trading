import React, { useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';

export default function ConsoleOutput({ messages, maxHeight = "400px" }) {
  const containerRef = useRef(null);
  
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [messages]);

  const getMessageStyle = (msg) => {
    if (msg.includes('"error"') || msg.includes('error')) return 'text-red-400';
    if (msg.includes('"status":"connected"') || msg.includes('success')) return 'text-emerald-400';
    if (msg.includes('"ev":"AM"')) return 'text-blue-400';
    if (msg.includes('"ev":"T"')) return 'text-purple-400';
    if (msg.includes('"ev":"Q"')) return 'text-amber-400';
    return 'text-slate-300';
  };

  return (
    <div 
      ref={containerRef}
      className="bg-slate-950 border border-slate-800 rounded-lg p-4 font-mono text-xs overflow-auto"
      style={{ maxHeight }}
    >
      {messages.length === 0 ? (
        <div className="text-slate-600 italic">Waiting for data...</div>
      ) : (
        <div className="space-y-1">
          {messages.map((msg, idx) => (
            <div 
              key={idx} 
              className={cn("break-all leading-relaxed", getMessageStyle(msg))}
            >
              <span className="text-slate-600 mr-2">[{String(idx + 1).padStart(3, '0')}]</span>
              {msg}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}