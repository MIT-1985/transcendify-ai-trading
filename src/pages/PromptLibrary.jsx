import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search, Plus, Play, Star, TrendingUp, Copy, History, Trash2, Edit } from 'lucide-react';
import PromptBuilder from '@/components/ai/PromptBuilder';
import PromptPlayground from '@/components/ai/PromptPlayground';
import { toast } from 'sonner';

export default function PromptLibrary() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [showBuilder, setShowBuilder] = useState(false);
  const [showPlayground, setShowPlayground] = useState(false);
  const [selectedPrompt, setSelectedPrompt] = useState(null);
  const [showVersions, setShowVersions] = useState(false);
  const queryClient = useQueryClient();

  const { data: prompts = [], isLoading } = useQuery({
    queryKey: ['prompts'],
    queryFn: () => base44.entities.AIPrompt.list('-created_date')
  });

  const createPromptMutation = useMutation({
    mutationFn: (data) => base44.entities.AIPrompt.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prompts'] });
      toast.success('Prompt saved successfully');
      setShowBuilder(false);
    }
  });

  const deletePromptMutation = useMutation({
    mutationFn: (id) => base44.entities.AIPrompt.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prompts'] });
      toast.success('Prompt deleted');
    }
  });

  const createVersionMutation = useMutation({
    mutationFn: async (prompt) => {
      const version = await base44.entities.AIPrompt.create({
        ...prompt,
        version: (prompt.version || 1) + 1,
        parent_prompt_id: prompt.id || prompt.parent_prompt_id,
        name: `${prompt.name} v${(prompt.version || 1) + 1}`
      });
      return version;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prompts'] });
      toast.success('New version created');
    }
  });

  const updateUsageMutation = useMutation({
    mutationFn: ({ id, times_used }) => 
      base44.entities.AIPrompt.update(id, { times_used: times_used + 1 }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prompts'] });
    }
  });

  const filteredPrompts = prompts.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         p.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || p.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const getPromptVersions = (promptId) => {
    return prompts.filter(p => p.parent_prompt_id === promptId || p.id === promptId)
                 .sort((a, b) => (b.version || 1) - (a.version || 1));
  };

  const handleSaveFromBuilder = (promptData) => {
    createPromptMutation.mutate(promptData);
  };

  const handleTestPrompt = (prompt) => {
    setSelectedPrompt(prompt);
    setShowPlayground(true);
  };

  const handleSaveTestResults = (results) => {
    if (selectedPrompt) {
      base44.entities.AIPrompt.update(selectedPrompt.id, {
        test_results: results
      });
    }
  };

  const getCategoryColor = (category) => {
    const colors = {
      conservative: 'bg-blue-500',
      aggressive: 'bg-red-500',
      volatility: 'bg-purple-500',
      trend_following: 'bg-green-500',
      mean_reversion: 'bg-yellow-500',
      custom: 'bg-slate-500'
    };
    return colors[category] || 'bg-slate-500';
  };

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-2">AI Prompt Library</h1>
            <p className="text-slate-400">Build, test, and manage your trading strategy prompts</p>
          </div>
          <Button
            onClick={() => setShowBuilder(true)}
            size="lg"
            className="bg-blue-600 hover:bg-blue-500"
          >
            <Plus className="w-5 h-5 mr-2" />
            Create New Prompt
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card className="p-4 bg-slate-900/50 border-slate-700">
            <div className="text-sm text-slate-400">Total Prompts</div>
            <div className="text-2xl font-bold">{prompts.length}</div>
          </Card>
          <Card className="p-4 bg-slate-900/50 border-slate-700">
            <div className="text-sm text-slate-400">Most Used</div>
            <div className="text-2xl font-bold text-blue-400">
              {Math.max(...prompts.map(p => p.times_used || 0))}
            </div>
          </Card>
          <Card className="p-4 bg-slate-900/50 border-slate-700">
            <div className="text-sm text-slate-400">Avg Success Rate</div>
            <div className="text-2xl font-bold text-green-400">
              {(prompts.reduce((sum, p) => sum + (p.success_rate || 0), 0) / prompts.length || 0).toFixed(1)}%
            </div>
          </Card>
          <Card className="p-4 bg-slate-900/50 border-slate-700">
            <div className="text-sm text-slate-400">Versions Created</div>
            <div className="text-2xl font-bold text-purple-400">
              {prompts.reduce((sum, p) => sum + (p.version || 1), 0)}
            </div>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex gap-4 mb-6">
          <div className="flex-1">
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search prompts..."
              className="bg-slate-900/50 border-slate-700"
              icon={<Search className="w-4 h-4" />}
            />
          </div>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="bg-slate-900/50 border border-slate-700 rounded-lg px-4 py-2"
          >
            <option value="all">All Categories</option>
            <option value="conservative">Conservative</option>
            <option value="aggressive">Aggressive</option>
            <option value="volatility">Volatility-Based</option>
            <option value="trend_following">Trend Following</option>
            <option value="mean_reversion">Mean Reversion</option>
            <option value="custom">Custom</option>
          </select>
        </div>

        {/* Prompts Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredPrompts.map((prompt) => (
            <Card key={prompt.id} className="p-5 bg-slate-900/50 border-slate-700 hover:border-blue-500/50 transition-all">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <h3 className="font-semibold mb-1">{prompt.name}</h3>
                  <p className="text-sm text-slate-400 line-clamp-2">{prompt.description}</p>
                </div>
                <Badge className={getCategoryColor(prompt.category)}>
                  v{prompt.version || 1}
                </Badge>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-2 mb-4 text-xs">
                <div className="bg-slate-800 p-2 rounded">
                  <div className="text-slate-400">Used</div>
                  <div className="font-semibold">{prompt.times_used || 0}x</div>
                </div>
                <div className="bg-slate-800 p-2 rounded">
                  <div className="text-slate-400">Success</div>
                  <div className="font-semibold text-green-400">{prompt.success_rate || 0}%</div>
                </div>
                <div className="bg-slate-800 p-2 rounded">
                  <div className="text-slate-400">Rating</div>
                  <div className="font-semibold text-yellow-400 flex items-center gap-1">
                    <Star className="w-3 h-3 fill-yellow-400" />
                    {prompt.feedback_score || 0}
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <Button
                  onClick={() => handleTestPrompt(prompt)}
                  variant="outline"
                  size="sm"
                  className="flex-1 border-blue-500/30 text-blue-400"
                >
                  <Play className="w-3 h-3 mr-1" />
                  Test
                </Button>
                <Button
                  onClick={() => {
                    updateUsageMutation.mutate({ id: prompt.id, times_used: prompt.times_used || 0 });
                    toast.success('Prompt copied to clipboard');
                    navigator.clipboard.writeText(prompt.prompt_text);
                  }}
                  variant="outline"
                  size="sm"
                  className="flex-1 border-green-500/30 text-green-400"
                >
                  <Copy className="w-3 h-3 mr-1" />
                  Use
                </Button>
                <Button
                  onClick={() => createVersionMutation.mutate(prompt)}
                  variant="outline"
                  size="icon"
                  className="border-purple-500/30 text-purple-400"
                >
                  <History className="w-4 h-4" />
                </Button>
                <Button
                  onClick={() => deletePromptMutation.mutate(prompt.id)}
                  variant="outline"
                  size="icon"
                  className="border-red-500/30 text-red-400"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </Card>
          ))}
        </div>

        {filteredPrompts.length === 0 && (
          <div className="text-center py-12">
            <p className="text-slate-400">No prompts found. Create your first prompt to get started!</p>
          </div>
        )}

        {/* Prompt Builder Modal */}
        <Dialog open={showBuilder} onOpenChange={setShowBuilder}>
          <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto bg-slate-900 border-slate-700">
            <DialogHeader>
              <DialogTitle>Create New AI Prompt</DialogTitle>
            </DialogHeader>
            <PromptBuilder
              onSave={handleSaveFromBuilder}
              onTest={() => setShowPlayground(true)}
            />
          </DialogContent>
        </Dialog>

        {/* Playground Modal */}
        <Dialog open={showPlayground} onOpenChange={setShowPlayground}>
          <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto bg-slate-900 border-slate-700">
            <DialogHeader>
              <DialogTitle>Prompt Playground - Test & Refine</DialogTitle>
            </DialogHeader>
            {selectedPrompt && (
              <PromptPlayground
                prompt={selectedPrompt.prompt_text}
                onSaveResults={handleSaveTestResults}
              />
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}