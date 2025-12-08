import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Zap } from 'lucide-react';

export default function TROKIndicator({ constantsCount, avgKPI, compact = false }) {
  if (compact) {
    return (
      <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/30" variant="outline">
        <Zap className="w-3 h-3 mr-1" />
        TROK: {constantsCount} ({avgKPI.toFixed(2)})
      </Badge>
    );
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-purple-500/10 border border-purple-500/30 rounded-lg">
      <Zap className="w-4 h-4 text-purple-400" />
      <div className="text-xs">
        <div className="font-semibold text-purple-300">TROK Optimized</div>
        <div className="text-purple-400/70">
          {constantsCount} constants • Avg KPI: {avgKPI.toFixed(3)}
        </div>
      </div>
    </div>
  );
}