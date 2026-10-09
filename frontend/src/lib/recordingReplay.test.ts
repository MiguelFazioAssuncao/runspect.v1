import { describe, expect, it } from 'vitest';
import { buildGraphState, createGraphReplay, frameEnds, isDirected, isMulti } from './graphReducer';
import { buildVectorsState, createVectorReplay } from './vectorReducer';
import type { TraceStep } from '@/types/visualizer';

const events = (items: [string, TraceStep['data']][]): TraceStep[] => items.map(([step_event, data], step) => ({step,step_event,data}));
describe('replay incremental da gravação e do player', () => {
  it('preserva snapshots de vetores ao avançar, saltar, voltar e repetir índices', () => {
    const steps = events([
      ['VECTOR_INIT',{name:'a',values:[3,2,1]}],['VECTOR_STEP',{name:'a'}],
      ['VECTOR_COMPARE',{name:'a',a:0,b:1}],['VECTOR_STEP',{name:'a'}],
      ['VECTOR_SWAP',{name:'a',a:0,b:1}],['VECTOR_STEP',{name:'a'}],
      ['VECTOR_MARK',{name:'a',index:0,state:'found'}],['STEP',{}],
      ['VECTOR_SET',{name:'a',index:9,value:1}],['VECTOR_STEP',{name:'a'}],
    ]);
    const replay = createVectorReplay(steps);
    const saved = replay(1); const frozen = structuredClone(saved);
    for (const index of [1,3,9,9,5,7,0,9]) expect(replay(index)).toEqual(buildVectorsState(steps,index));
    expect(saved).toEqual(frozen);
  });
  it('preserva multiarestas, flags, remoções e snapshots anteriores dos grafos', () => {
    const steps = events([
      ['ADD_NODE',{id:0}],['ADD_NODE',{id:1}],['ADD_EDGE',{u:0,v:1}],['STEP',{}],
      ['SET_MULTI',{multi:true}],['ADD_EDGE',{u:0,v:1}],['STEP',{}],
      ['SET_DIRECTED',{directed:false}],['GRAPH_NODE',{id:1,state:'visiting'}],['STEP',{}],
      ['REMOVE_NODE',{id:0}],['STEP',{}],
    ]);
    const replay = createGraphReplay(steps);
    const saved = replay(3,true,false); const frozen = structuredClone(saved);
    for (const index of [...frameEnds(steps),3,11,0,6,6]) expect(replay(index,isDirected(steps,index),isMulti(steps,index))).toEqual(buildGraphState(steps,index,isDirected(steps,index),isMulti(steps,index)));
    expect(saved).toEqual(frozen);
  });
});
