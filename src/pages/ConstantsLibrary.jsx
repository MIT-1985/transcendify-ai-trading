import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Database, Search, Filter, TrendingUp } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

export default function ConstantsLibrary() {
  const [searchTerm, setSearchTerm] = useState('');
  const [domainFilter, setDomainFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');

  const { data: constants = [], isLoading } = useQuery({
    queryKey: ['constants'],
    queryFn: () => base44.entities.GlobalIntelligenceLaw.list('-kpi_value', 5000)
  });

  // Get unique domains and types
  const domains = [...new Set(constants.map(c => c.domain))].sort();
  const types = [...new Set(constants.map(c => c.type))].sort();

  // Filter constants
  const filtered = constants.filter(c => {
    const matchesSearch = !searchTerm || 
      c.law_principle.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.domain.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.formula_statement.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesDomain = domainFilter === 'all' || c.domain === domainFilter;
    const matchesType = typeFilter === 'all' || c.type === typeFilter;

    return matchesSearch && matchesDomain && matchesType;
  });

  // Group by domain
  const grouped = filtered.reduce((acc, c) => {
    if (!acc[c.domain]) acc[c.domain] = [];
    acc[c.domain].push(c);
    return acc;
  }, {});

  const getTypeColor = (type) => {
    const colors = {
      'Theoretical': 'bg-purple-500/20 text-purple-300 border-purple-500/30',
      'Empirical': 'bg-blue-500/20 text-blue-300 border-blue-500/30',
      'Model': 'bg-green-500/20 text-green-300 border-green-500/30',
      'Observational': 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
      'Heuristic': 'bg-orange-500/20 text-orange-300 border-orange-500/30'
    };
    return colors[type] || 'bg-slate-500/20 text-slate-300';
  };

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2 flex items-center gap-2">
            <Database className="w-8 h-8 text-blue-400" />
            Global Intelligence Constants
          </h1>
          <p className="text-slate-400">
            {constants.length.toLocaleString()} Laws, Principles & Patterns from TROK Theory
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <Card className="bg-slate-900 border-slate-800">
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{constants.length.toLocaleString()}</div>
              <div className="text-sm text-slate-400">Total Constants</div>
            </CardContent>
          </Card>
          <Card className="bg-slate-900 border-slate-800">
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{domains.length}</div>
              <div className="text-sm text-slate-400">Domains</div>
            </CardContent>
          </Card>
          <Card className="bg-slate-900 border-slate-800">
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{types.length}</div>
              <div className="text-sm text-slate-400">Types</div>
            </CardContent>
          </Card>
          <Card className="bg-slate-900 border-slate-800">
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-green-400">
                {(constants.filter(c => c.kpi_value >= 0.9).length / constants.length * 100).toFixed(1)}%
              </div>
              <div className="text-sm text-slate-400">High KPI (≥0.9)</div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex gap-4 mb-6">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search constants, formulas, domains..."
              className="pl-10 bg-slate-900 border-slate-800"
            />
          </div>
          <Select value={domainFilter} onValueChange={setDomainFilter}>
            <SelectTrigger className="w-64 bg-slate-900 border-slate-800">
              <SelectValue placeholder="All Domains" />
            </SelectTrigger>
            <SelectContent className="bg-slate-900 border-slate-800">
              <SelectItem value="all">All Domains ({domains.length})</SelectItem>
              {domains.map(d => (
                <SelectItem key={d} value={d}>{d}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-48 bg-slate-900 border-slate-800">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent className="bg-slate-900 border-slate-800">
              <SelectItem value="all">All Types</SelectItem>
              {types.map(t => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Constants List */}
        {isLoading ? (
          <div className="space-y-4">
            {[1,2,3].map(i => <Skeleton key={i} className="h-32 bg-slate-900" />)}
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(grouped).map(([domain, domainConstants]) => (
              <Card key={domain} className="bg-slate-900 border-slate-800">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>{domain}</span>
                    <Badge variant="outline" className="text-slate-400">
                      {domainConstants.length} constants
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3">
                    {domainConstants.slice(0, 20).map(constant => (
                      <div key={constant.id} className="bg-slate-800/50 rounded-lg p-4 hover:bg-slate-800 transition-colors">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1">
                            <div className="font-semibold text-white mb-1">{constant.law_principle}</div>
                            <div className="font-mono text-sm text-blue-400 mb-2">{constant.formula_statement}</div>
                          </div>
                          <div className="flex items-center gap-2">
                            {constant.kpi_value && (
                              <Badge className="bg-green-500/20 text-green-300">
                                KPI: {constant.kpi_value.toFixed(3)}
                              </Badge>
                            )}
                            <Badge className={getTypeColor(constant.type)} variant="outline">
                              {constant.type}
                            </Badge>
                          </div>
                        </div>
                        <div className="flex gap-4 text-xs text-slate-400">
                          <span>Use: {constant.use_cases_notes}</span>
                          <span>•</span>
                          <span>{constant.epoch_version}</span>
                        </div>
                      </div>
                    ))}
                    {domainConstants.length > 20 && (
                      <div className="text-center text-sm text-slate-500">
                        + {domainConstants.length - 20} more constants in this domain
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {filtered.length === 0 && !isLoading && (
          <div className="text-center py-12">
            <Database className="w-16 h-16 mx-auto text-slate-700 mb-4" />
            <div className="text-slate-500">No constants found matching your filters</div>
          </div>
        )}
      </div>
    </div>
  );
}