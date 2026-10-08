'use client';

import React from 'react';
import { Play, Pause, SkipBack, RotateCcw, SkipForward } from 'lucide-react';

interface TimelineControlsProps {
  currentStep: number;
  totalSteps: number;
  isPlaying: boolean;
  speed: number;
  onPlayToggle: () => void;
  onNext: () => void;
  onPrev: () => void;
  onSeek: (step: number) => void;
  onSpeedChange: (speed: number) => void;
}

export const TimelineControls: React.FC<TimelineControlsProps> = ({
  currentStep,
  totalSteps,
  isPlaying,
  speed,
  onPlayToggle,
  onNext,
  onPrev,
  onSeek,
  onSpeedChange,
}) => {
  const hasSteps = totalSteps > 0;

  return (
    <div className="w-full flex flex-row items-center justify-between gap-4 px-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl shadow-lg">
      <div className="flex items-center gap-1">
        <button
          onClick={() => onSeek(0)}
          disabled={!hasSteps}
          className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent rounded-lg transition-colors"
          title="Reiniciar"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
        <button
          onClick={onPrev}
          disabled={!hasSteps}
          className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent rounded-lg transition-colors"
          title="Anterior"
        >
          <SkipBack className="w-4 h-4" />
        </button>
        <button
          onClick={onPlayToggle}
          disabled={!hasSteps}
          className="p-2 bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-40 disabled:hover:bg-blue-600 rounded-lg transition-colors shadow-sm"
          title={isPlaying ? 'Pausar' : 'Play'}
        >
          {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
        </button>
        <button
          onClick={onNext}
          disabled={!hasSteps}
          className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent rounded-lg transition-colors"
          title="Próximo"
        >
          <SkipForward className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 flex items-center gap-3 min-w-[140px]">
        <span className="font-mono text-xs text-slate-400 whitespace-nowrap">
          Passo {hasSteps ? currentStep + 1 : 0} / {totalSteps}
        </span>
        <input
          type="range"
          min={0}
          max={Math.max(0, totalSteps - 1)}
          value={hasSteps ? currentStep : 0}
          onChange={(e) => onSeek(Number(e.target.value))}
          disabled={!hasSteps}
          className="w-full h-1.5 bg-slate-800 accent-blue-500 rounded-lg cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
        />
      </div>

      <div className="flex items-center gap-1 p-1 bg-slate-950 border border-slate-800 rounded-lg">
        {[0.5, 1, 2, 4].map((s) => (
          <button
            key={s}
            onClick={() => onSpeedChange(s)}
            className={`px-2 py-0.5 font-mono text-[11px] font-semibold rounded transition-colors ${
              speed === s
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {s}x
          </button>
        ))}
      </div>
    </div>
  );
};