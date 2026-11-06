'use client';

import React from 'react';
import { Play, Pause, SkipBack, RotateCcw, SkipForward } from 'lucide-react';
import { useLocale } from '@/lib/i18n';
import { PLAYBACK_SPEEDS } from '@/lib/playback';

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
  const { tr } = useLocale();
  const hasSteps = totalSteps > 0;
  const controlsDisabled = !hasSteps || disabled;
  const completed = hasSteps && currentStep === totalSteps - 1;

  return (
    <div className="timeline-controls">
      <div className="timeline-buttons">
        <button
          type="button"
          onClick={() => onSeek(0)}
          disabled={controlsDisabled}
          className="timeline-btn"
          title={tr('Reiniciar', 'Restart')}
          aria-label={tr('Reiniciar', 'Restart')}
        >
          <RotateCcw />
        </button>
        <button
          type="button"
          onClick={onPrev}
          disabled={controlsDisabled}
          className="timeline-btn"
          title={tr('Anterior', 'Previous')}
          aria-label={tr('Anterior', 'Previous')}
        >
          <SkipBack />
        </button>
        <button
          type="button"
          onClick={onPlayToggle}
          disabled={controlsDisabled}
          className="timeline-btn timeline-btn-primary"
          title={isPlaying ? tr('Pausar', 'Pause') : 'Play'}
          aria-label={isPlaying ? tr('Pausar', 'Pause') : 'Play'}
        >
          {isPlaying ? <Pause /> : <Play />}
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={controlsDisabled}
          className="timeline-btn"
          title={tr('Próximo', 'Next')}
          aria-label={tr('Próximo', 'Next')}
        >
          <SkipForward />
        </button>
      </div>

      <div className="timeline-progress">
        <span className="timeline-step">
          {tr('Passo', 'Step')} {hasSteps ? currentStep + 1 : 0} / {totalSteps}
        </span>
        {completed && <span className="timeline-completed" role="status">{tr('Concluído', 'Done')}</span>}
        <input
          type="range"
          min={0}
          max={Math.max(0, totalSteps - 1)}
          value={hasSteps ? currentStep : 0}
          onChange={(e) => onSeek(Number(e.target.value))}
          disabled={controlsDisabled}
          className="timeline-slider"
          aria-label={tr('Posição na linha do tempo', 'Timeline position')}
        />
      </div>

      <div className="timeline-speed">
        <label htmlFor="playback-speed">{tr('Velocidade', 'Speed')}</label>
        <select
          id="playback-speed"
          value={speed}
          onChange={(event) => onSpeedChange(Number(event.target.value))}
          disabled={disabled}
          aria-label={tr('Velocidade de reprodução', 'Playback speed')}
          className="timeline-speed-select"
        >
          {PLAYBACK_SPEEDS.map((value) => <option key={value} value={value}>{value}×</option>)}
        </select>
      </div>
    </div>
  );
};
