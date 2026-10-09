import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TimelineControls } from './TimelineControls';

const render = (currentStep: number, totalSteps = 3) => renderToStaticMarkup(createElement(TimelineControls, {
  currentStep, totalSteps, isPlaying: false, speed: 1,
  onPlayToggle() {}, onNext() {}, onPrev() {}, onSeek() {}, onSpeedChange() {},
}));

describe('conclusão na linha do tempo', () => {
  it('sinaliza o último quadro e remove o status ao voltar', () => {
    expect(render(2)).toContain('Concluído');
    expect(render(1)).not.toContain('Concluído');
  });

  it('não sinaliza conclusão sem uma execução', () => {
    expect(render(0, 0)).not.toContain('Concluído');
  });
});
