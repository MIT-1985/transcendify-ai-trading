import React from 'react';
import { Globe } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function LanguageSwitcher({ language, onLanguageChange }) {
  return (
    <Select value={language} onValueChange={onLanguageChange}>
      <SelectTrigger className="w-32 bg-slate-800 border-slate-700 text-white">
        <Globe className="w-4 h-4 mr-2" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="bg-slate-800 border-slate-700 text-white">
        <SelectItem value="en">English</SelectItem>
        <SelectItem value="bg">Български</SelectItem>
        <SelectItem value="de">Deutsch</SelectItem>
      </SelectContent>
    </Select>
  );
}