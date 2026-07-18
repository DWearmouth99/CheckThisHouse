import React from 'react';
import { SavedAnalysis } from '../types';
import { Trash2, Home, Landmark, Calculator, TrendingUp, Heart } from 'lucide-react';

interface SavedListProps {
  savedAnalyses: SavedAnalysis[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string, e: React.MouseEvent) => void;
}

export default function SavedList({ savedAnalyses, activeId, onSelect, onDelete }: SavedListProps) {
  
  const getGoalIcon = (goal: string) => {
    switch (goal) {
      case 'First-time Buyer':
        return <Heart className="w-4 h-4 text-rose-500" />;
      case 'Buy-to-Let Investor':
        return <Landmark className="w-4 h-4 text-emerald-500" />;
      case 'Family Home':
        return <Home className="w-4 h-4 text-violet-500" />;
      case 'House Flipping':
        return <Calculator className="w-4 h-4 text-amber-500" />;
      case 'Retirement':
        return <TrendingUp className="w-4 h-4 text-sky-500" />;
      default:
        return <Home className="w-4 h-4 text-slate-400" />;
    }
  };

  if (savedAnalyses.length === 0) {
    return (
      <div className="bg-white shadow-sm border border-slate-200 rounded-xl p-6 text-center text-slate-500">
        <Home className="w-8 h-8 mx-auto mb-2 text-slate-400" />
        <p className="font-display font-medium text-sm text-slate-700">No properties analyzed yet</p>
        <p className="text-xs mt-1 text-slate-500">Your historical property reports will automatically appear here for simple comparison.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="font-display font-semibold text-xs tracking-wider uppercase text-slate-500 mb-2">
        My Analyzed Listings ({savedAnalyses.length})
      </h3>
      <div className="space-y-2 max-h-[450px] overflow-y-auto pr-1">
        {savedAnalyses.map((item) => {
          const isActive = activeId === item.id;
          return (
            <div
              key={item.id}
              onClick={() => onSelect(item.id)}
              className={`p-3.5 rounded-xl cursor-pointer transition-all duration-200 border text-left group flex items-start justify-between shadow-sm ${
                isActive
                  ? 'bg-blue-50 border-blue-500'
                  : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              <div className="flex-1 min-w-0 pr-2">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className="bg-slate-100 px-2 py-0.5 rounded text-[10px] font-medium text-slate-600 flex items-center gap-1 border border-slate-200">
                    {getGoalIcon(item.buyerGoal)}
                    {item.buyerGoal}
                  </span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                    item.analysis.scores.overall >= 80 
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                      : item.analysis.scores.overall >= 60
                      ? 'bg-amber-50 text-amber-700 border-amber-200'
                      : 'bg-rose-50 text-rose-700 border-rose-200'
                  }`}>
                    Score: {item.analysis.scores.overall}
                  </span>
                </div>
                <h4 className="font-display font-semibold text-xs text-slate-900 truncate leading-snug">
                  {item.address}
                </h4>
                <div className="flex items-center justify-between mt-2">
                  <span className="font-sans font-bold text-emerald-600 text-[13px]">
                    {item.price}
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">
                    {new Date(item.analyzedAt).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                </div>
              </div>
              
              <button
                onClick={(e) => onDelete(item.id, e)}
                className="text-slate-400 hover:text-rose-600 p-1.5 rounded-lg hover:bg-rose-50 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100 self-center"
                title="Remove analysis"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
