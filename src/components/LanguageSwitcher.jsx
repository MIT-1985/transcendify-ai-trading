import React from 'react';
import { Globe } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function LanguageSwitcher({ language, onLanguageChange }) {
  return (
    <Select value={language} onValueChange={onLanguageChange}>
      <SelectTrigger className="w-32 bg-slate-800 border-slate-700 text-white">
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4" />
          <SelectValue />
        </div>
      </SelectTrigger>
      <SelectContent className="bg-slate-800 border-slate-700 text-white">
        <SelectItem value="en">English</SelectItem>
        <SelectItem value="bg">Български</SelectItem>
        <SelectItem value="de">Deutsch</SelectItem>
      </SelectContent>
    </Select>
  );
}