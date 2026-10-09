import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import { ProgramConsole } from '@/components/visualizer/ProgramConsole';
import { programConsoleAt } from './programConsole';
import { terminalOutput } from './terminalOutput';
import type { TraceStep } from '@/types/visualizer';

describe('console do programa na visualização', () => {
  const steps: TraceStep[] = [
    { step: 1, step_event: 'PRINT', data: { message: 'trace, não stdout' } },
    { step: 2, step_event: 'STEP', data: { caption: 'Início' } },
    { step: 3, step_event: 'PROGRAM_OUTPUT', data: { text: 'VENDA\n' } },
    { step: 4, step_event: 'STEP', data: { caption: 'Primeira consulta' } },
    { step: 5, step_event: 'PROGRAM_OUTPUT', data: { text: 'VENDA\n' } },
    { step: 6, step_event: 'STEP', data: { caption: 'Segunda consulta' } },
  ];
  it('acumula apenas as consultas já executadas e permite voltar', () => {
    expect(programConsoleAt(steps, 5)).toEqual({ output: 'VENDA\nVENDA\n', warnings: [] });
    expect(programConsoleAt(steps, 3)).toEqual({ output: 'VENDA\n', warnings: [] });
    expect(programConsoleAt(steps, 1)).toEqual({ output: '', warnings: [] });
  });
  it('não anuncia conclusão nem revela saída de passos futuros no terminal', () => {
    const status = 'Concluído em 100 ms.';
    expect(terminalOutput(programConsoleAt(steps, 1).output, status, false)).not.toContain('VENDA');
    expect(terminalOutput(programConsoleAt(steps, 3).output, status, false)).toBe('VENDA\n');
    expect(terminalOutput(programConsoleAt(steps, 5).output, status, true)).toBe('VENDA\nVENDA\n\nConcluído em 100 ms.');
  });
  it('reconhece o erro de entrada no passo onde a leitura falhou', () => {
    const failed: TraceStep[] = [...steps, { step: 7, step_event: 'INPUT_ERROR', data: { message: 'Entrada insuficiente' } }];
    expect(programConsoleAt(failed, 5).warnings).toEqual([]);
    expect(programConsoleAt(failed, 6).warnings).toEqual(['Entrada insuficiente']);
  });
  it('renderiza stdout como texto e preserva quebras de linha', () => {
    const markup = renderToStaticMarkup(React.createElement(ProgramConsole, { output: '<script>\nVENDA\n', warnings: ['Entrada insuficiente'] }));
    expect(markup).toContain('saída do programa');
    expect(markup).toContain('&lt;script&gt;\nVENDA\n');
    expect(markup).toContain('role="alert"');
  });
});
