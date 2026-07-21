import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { ShieldCheck } from 'lucide-react';

type Props = {
  open: boolean;
  mode: 'listing' | 'address';
};

const LISTING_STEPS = [
  'Reading your listing…',
  'Gathering sold prices nearby…',
  'Checking schools and area signals…',
  'Reviewing risks and local context…',
  'Building fair value bands…',
  'Shaping offer guidance…',
  'Assembling your branded PDF…',
];

const ADDRESS_STEPS = [
  'Looking up this address…',
  'Finding sold history nearby…',
  'Checking schools and area signals…',
  'Reviewing risks and local context…',
  'Estimating value bands…',
  'Building practical next steps…',
  'Assembling your branded PDF…',
];

/**
 * Progress keeps moving for several minutes so a long run never looks frozen.
 * Approaches ~94% by ~3.5 minutes, then creeps slowly toward 97%.
 */
function progressFromElapsed(sec: number): number {
  if (sec <= 210) {
    const t = sec / 210;
    const eased = 1 - Math.pow(1 - t, 1.25);
    return Math.min(94, Math.round(6 + eased * 88));
  }
  const extra = Math.min(3, Math.floor((sec - 210) / 20));
  return Math.min(97, 94 + extra);
}

export function ReportGeneratingOverlay({ open, mode }: Props) {
  const steps = mode === 'address' ? ADDRESS_STEPS : LISTING_STEPS;
  const [elapsedSec, setElapsedSec] = useState(0);
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    if (!open) return;
    setElapsedSec(0);
    setStepIndex(0);

    const tick = setInterval(() => setElapsedSec((s) => s + 1), 1000);
    const stepTimer = setInterval(() => {
      setStepIndex((i) => (i + 1) % steps.length);
    }, 14000);

    return () => {
      clearInterval(tick);
      clearInterval(stepTimer);
    };
  }, [open, steps.length]);

  useEffect(() => {
    if (!open) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [open]);

  const progress = useMemo(() => progressFromElapsed(elapsedSec), [elapsedSec]);
  const longWait = elapsedSec >= 90;
  const veryLongWait = elapsedSec >= 150;

  if (!open) return null;

  return (
    <motion.div
      key="analyzing"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-brand-navy/55 backdrop-blur-sm px-0 sm:px-5 py-0 sm:py-6"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Generating report"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98 }}
        className="w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl bg-white border border-brand-line shadow-2xl p-6 sm:p-7 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
      >
        <div className="flex items-center gap-3 mb-5">
          <div className="relative w-11 h-11 shrink-0">
            <div className="absolute inset-0 rounded-full border-2 border-brand-green/20" />
            <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-brand-green animate-spin" />
            <ShieldCheck className="absolute inset-0 m-auto w-5 h-5 text-brand-green" />
          </div>
          <div className="min-w-0">
            <p className="font-display font-bold text-lg text-brand-navy leading-snug">
              Building your report
            </p>
            <p className="text-sm text-brand-muted mt-0.5 leading-snug">
              Usually 1–3 minutes — keep this tab open
            </p>
          </div>
        </div>

        <p className="text-sm text-brand-navy font-medium min-h-[1.5rem] leading-snug">
          {steps[stepIndex]}
        </p>

        <div className="mt-4 h-1.5 rounded-full bg-brand-paper overflow-hidden">
          <motion.div
            className="h-full rounded-full bg-brand-green"
            initial={false}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.9, ease: 'easeOut' }}
          />
        </div>

        <p className="mt-3 text-xs text-brand-muted leading-relaxed flex items-center gap-2">
          <span className="relative flex h-1.5 w-1.5 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-green opacity-60" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-brand-green" />
          </span>
          {veryLongWait
            ? 'Still researching — this hasn’t crashed. Deep checks can take a few minutes.'
            : longWait
              ? 'Still working on sold prices and local checks…'
              : 'Researching public sources…'}
        </p>
      </motion.div>
    </motion.div>
  );
}
