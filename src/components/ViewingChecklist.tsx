import { useState } from 'react';
import { PropertyAnalysis } from '../types';
import { HelpCircle, ClipboardCheck, Sparkles } from 'lucide-react';

interface ViewingChecklistProps {
  analysis: PropertyAnalysis;
}

export default function ViewingChecklist({ analysis }: ViewingChecklistProps) {
  const { viewingChecks, agentQuestions } = analysis;

  // Track checked states for the structural visual inspection checklist
  const [checkedPoints, setCheckedPoints] = useState<Record<number, boolean>>({});

  // Track checked states for the agent questionnaire
  const [checkedQuestions, setCheckedQuestions] = useState<Record<number, boolean>>({});

  const togglePoint = (idx: number) => {
    setCheckedPoints((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  const toggleQuestion = (idx: number) => {
    setCheckedQuestions((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

      {/* 1. Structural Visual Checkpoints */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <ClipboardCheck className="w-5 h-5 text-emerald-600" />
          <div>
            <h4 className="font-display font-semibold text-sm text-slate-900">Physical In-Person Verification Points</h4>
            <p className="text-[10px] text-slate-500 mt-0.5">Custom items to inspect for signs of damp, roof wear, or subsidence.</p>
          </div>
        </div>

        <div className="space-y-2">
          {viewingChecks && viewingChecks.length > 0 ? (
            viewingChecks.map((check, idx) => {
              const isChecked = !!checkedPoints[idx];
              return (
                <div
                  key={idx}
                  onClick={() => togglePoint(idx)}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all duration-150 flex items-start gap-3 select-none ${
                    isChecked
                      ? 'bg-emerald-50 border-emerald-200 text-slate-500'
                      : 'bg-slate-50 border-slate-200 text-slate-800 hover:border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  <div className={`w-4.5 h-4.5 rounded flex items-center justify-center border text-[10px] mt-0.5 transition-colors duration-150 ${
                    isChecked
                      ? 'bg-emerald-500 border-emerald-500 text-white'
                      : 'border-slate-300 bg-white'
                  }`}>
                    {isChecked && '✓'}
                  </div>
                  <span className={`text-xs leading-relaxed font-sans ${isChecked ? 'line-through text-slate-400' : ''}`}>
                    {check}
                  </span>
                </div>
              );
            })
          ) : (
            <p className="text-xs text-slate-500">Inspection checks not compiled for this listing.</p>
          )}
        </div>
      </div>

      {/* 2. Questions to Ask the Listing Agent */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <HelpCircle className="w-5 h-5 text-amber-600" />
          <div>
            <h4 className="font-display font-semibold text-sm text-slate-900">Shrewd Questions to Ask the Broker</h4>
            <p className="text-[10px] text-slate-500 mt-0.5">Expose motivated sellers, previous chain failures, or leasehold traps.</p>
          </div>
        </div>

        <div className="space-y-2">
          {agentQuestions && agentQuestions.length > 0 ? (
            agentQuestions.map((question, idx) => {
              const isChecked = !!checkedQuestions[idx];
              return (
                <div
                  key={idx}
                  onClick={() => toggleQuestion(idx)}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all duration-150 flex items-start gap-3 select-none ${
                    isChecked
                      ? 'bg-amber-50 border-amber-200 text-slate-500'
                      : 'bg-slate-50 border-slate-200 text-slate-800 hover:border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  <div className={`w-4.5 h-4.5 rounded flex items-center justify-center border text-[10px] mt-0.5 transition-colors duration-150 ${
                    isChecked
                      ? 'bg-amber-500 border-amber-500 text-white'
                      : 'border-slate-300 bg-white'
                  }`}>
                    {isChecked && '✓'}
                  </div>
                  <span className={`text-xs leading-relaxed font-sans ${isChecked ? 'line-through text-slate-400' : ''}`}>
                    {question}
                  </span>
                </div>
              );
            })
          ) : (
            <p className="text-xs text-slate-500">Agent questions not formulated.</p>
          )}
        </div>

        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex gap-3 text-xs text-amber-800">
          <Sparkles className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="leading-relaxed font-sans">
            <strong>Insider tip:</strong> Always ask these face-to-face during a viewing instead of phone or email. Note down their body language, hesitation, or details of standard vendor urgency.
          </p>
        </div>
      </div>

    </div>
  );
}
