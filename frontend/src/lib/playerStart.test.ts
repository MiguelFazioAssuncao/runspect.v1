import { describe, expect, it } from 'vitest';
import type { TraceStep } from '@/types/visualizer';
import { frameEnds } from './graphReducer';
import { playerStartFrame } from './playerStart';

const event = (step_event: string, data?: TraceStep['data']): TraceStep => ({
  step: 0,
  step_event,
  data,
});

const startup = [
  event('SET_STRUCT', { name: 'Execução', items: ['linha 4'] }),
  event('STEP', { line: 4 }),
  event('SET_STRUCT', { name: 'Variáveis', items: ['n = 7'] }),
  event('STEP', { line: 6 }),
];

describe('playerStartFrame', () => {
  it('inicia a visualização automática no primeiro quadro com vetor', () => {
    const steps = [
      ...startup,
      event('VECTOR_INIT', { name: 'a', values: [0, 0] }),
      event('STEP', { line: 7 }),
      event('VECTOR_SET', { name: 'a', index: 0, value: 3 }),
      event('STEP', { line: 8 }),
    ];
    const frames = frameEnds(steps);
    expect(playerStartFrame(steps, frames, true)).toBe(2);
    expect(frames).toEqual([1, 3, 5, 7]);
  });

  it('mantém o primeiro quadro como padrão para código manual e gravação', () => {
    const steps = [...startup, event('VECTOR_INIT', { name: 'a', values: [1] }), event('STEP')];
    expect(playerStartFrame(steps, frameEnds(steps))).toBe(0);
    expect(playerStartFrame(steps, frameEnds(steps), false)).toBe(0);
  });

  it.each([
    ['grafo', event('ADD_NODE', { id: 1, label: '1' })],
    ['matriz', event('SET_MATRIX', { name: 'matriz', rows: [['1']] })],
    ['estrutura', event('SET_STRUCT', { name: 'fila', items: ['1'] })],
  ])('seleciona o primeiro quadro com %s do usuário', (_label, visual) => {
    const steps = [...startup, visual, event('STEP')];
    expect(playerStartFrame(steps, frameEnds(steps), true)).toBe(2);
  });

  it('escolhe a primeira estrutura do usuário mesmo que um vetor venha depois', () => {
    const steps = [
      ...startup,
      event('SET_STRUCT', { name: 'pilha', items: ['3'] }),
      event('STEP'),
      event('VECTOR_INIT', { name: 'a', values: [1] }),
      event('STEP'),
    ];
    expect(playerStartFrame(steps, frameEnds(steps), true)).toBe(2);
  });

  it('retorna ao quadro zero quando existem apenas variáveis escalares', () => {
    expect(playerStartFrame(startup, frameEnds(startup), true)).toBe(0);
  });

  it('retorna ao quadro zero quando não há visualização', () => {
    const steps = [event('PRINT', { message: '42' }), event('STEP')];
    expect(playerStartFrame(steps, frameEnds(steps), true)).toBe(0);
    expect(playerStartFrame([], [], true)).toBe(0);
  });

  it('usa o quadro que inclui o evento no limite exato', () => {
    const steps = [event('STEP'), event('VECTOR_INIT', { name: 'a', values: [] })];
    expect(frameEnds(steps)).toEqual([0, 1]);
    expect(playerStartFrame(steps, frameEnds(steps), true)).toBe(1);
  });

  it('usa o quadro seguinte quando a visualização vem depois de STEP', () => {
    const steps = [
      event('STEP'),
      event('VECTOR_INIT', { name: 'a', values: [1] }),
      event('STEP'),
    ];
    expect(playerStartFrame(steps, frameEnds(steps), true)).toBe(1);
  });

  it('funciona em traces sem delimitadores de quadro', () => {
    const steps = [event('PRINT'), event('ADD_NODE', { id: 1 })];
    expect(playerStartFrame(steps, frameEnds(steps), true)).toBe(1);
  });

  it('ignora eventos incompletos que não criam uma visualização', () => {
    const steps = [
      event('VECTOR_INIT', { name: 'a' }),
      event('ADD_NODE', { id: NaN }),
      event('SET_MATRIX'),
      event('SET_STRUCT', { name: 'fila' }),
      event('STEP'),
      event('VECTOR_INIT', { name: 'b', values: [1] }),
      event('STEP'),
    ];
    expect(playerStartFrame(steps, frameEnds(steps), true)).toBe(1);
  });

  it('não escolhe um quadro fora dos limites fornecidos', () => {
    const steps = [event('STEP'), event('VECTOR_INIT', { name: 'a', values: [1] })];
    expect(playerStartFrame(steps, [], true)).toBe(0);
    expect(playerStartFrame(steps, [0], true)).toBe(0);
  });
});
