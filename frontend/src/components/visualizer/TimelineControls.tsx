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
  disabled?: boolean;
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
  disabled = false,
}) => {
  const hasSteps = totalSteps > 0;
  const controlsDisabled = !hasSteps || disabled;

  return (
    <div className="timeline-controls">
      <div className="timeline-buttons">
        <button
          type="button"
          onClick={() => onSeek(0)}
          disabled={controlsDisabled}
          className="timeline-btn"
          title="Reiniciar"
          aria-label="Reiniciar"
        >
          <RotateCcw />
        </button>
        <button
          type="button"
          onClick={onPrev}
          disabled={controlsDisabled}
          className="timeline-btn"
          title="Anterior"
          aria-label="Anterior"
        >
          <SkipBack />
        </button>
        <button
          type="button"
          onClick={onPlayToggle}
          disabled={controlsDisabled}
          className="timeline-btn timeline-btn-primary"
          title={isPlaying ? 'Pausar' : 'Play'}
          aria-label={isPlaying ? 'Pausar' : 'Play'}
        >
          {isPlaying ? <Pause /> : <Play />}
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={controlsDisabled}
          className="timeline-btn"
          title="Próximo"
          aria-label="Próximo"
        >
          <SkipForward />
        </button>
      </div>

      <div className="timeline-progress">
        <span className="timeline-step">
          Passo {hasSteps ? currentStep + 1 : 0} / {totalSteps}
        </span>
        <input
          type="range"
          min={0}
          max={Math.max(0, totalSteps - 1)}
          value={hasSteps ? currentStep : 0}
          onChange={(e) => onSeek(Number(e.target.value))}
          disabled={controlsDisabled}
          className="timeline-slider"
          aria-label="Posição na linha do tempo"
        />
      </div>

      <div className="timeline-speed">
        {[0.5, 1, 2, 4].map((s) => (
          <button
            type="button"
            key={s}
            onClick={() => onSpeedChange(s)}
            disabled={disabled}
            className={`timeline-speed-btn ${speed === s ? 'timeline-speed-btn-active' : ''}`}
            aria-pressed={speed === s}
          >
            {s}x
          </button>
        ))}
      </div>
    </div>
  );
};
