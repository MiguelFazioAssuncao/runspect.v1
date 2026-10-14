import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { buildTraceState, createTraceReplay } from '../../src/lib/traceState';
import { buildVectorsState } from '../../src/lib/vectorReducer';
import type { TraceStep } from '../../src/types/visualizer';

let directory: string;
let serial = 0;
beforeAll(() => { directory = mkdtempSync(join(tmpdir(), 'runspect-resources-')); });
afterAll(() => { if (directory) rmSync(directory, { recursive: true, force: true }); });

function run(code: string, output: string) {
  const backend = resolve(process.cwd(), '../backend');
  const source = join(directory, `${++serial}.cpp`);
  const binary = `${source}.bin`;
  writeFileSync(source, '#include <bits/stdc++.h>\nusing namespace std;\n' + code);
  const runtime = process.env.RUNSPECT_CLANG_RUNTIME ?? join(backend, '.runtime/clang');
  const args = ['-B', join(backend, 'pkg/visualizer/instrument_cpp.py'), source];
  if (existsSync(runtime)) args.push('--runtime', runtime);
  const analysis = spawnSync('/usr/bin/python3', args, { encoding: 'utf8', timeout: 30_000 });
  expect(analysis.status, analysis.stderr).toBe(0);
  const compilation = spawnSync('g++', ['-std=c++17', '-O0', '-I', join(backend, 'pkg/visualizer'), source, '-o', binary], { encoding: 'utf8', timeout: 30_000 });
  expect(compilation.status, compilation.stderr).toBe(0);
  const execution = spawnSync(binary, [], { encoding: 'utf8', timeout: 5_000, maxBuffer: 16 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe', 'pipe'] });
  expect(execution.status, `${execution.error ?? ''} ${execution.signal ?? ''} ${execution.stderr}`).toBe(0);
  expect(execution.stdout).toBe(output);
  const steps: TraceStep[] = String(execution.output[3]).trim().split('\n').map((line, step) => {
    const { step_event, ...data } = JSON.parse(line);
    return { step_event, step, data };
  });
  return { steps, analysis: JSON.parse(analysis.stdout) };
}

describe('automatic object, template and control flow resources', () => {
  it('captures public fields, cycles, shared pointers and released memory without dereferencing unknown pointers', () => {
    const { steps, analysis } = run(`
struct Node { int value=0; Node* next=nullptr; };
int main() {
 Node* head=new Node{7}; Node* tail=new Node{9};
 head->next=tail; tail->next=head;
 Node* shared=tail; Node* unknown=reinterpret_cast<Node*>(1);
 cout << head->value << ':' << shared->value << ':' << (unknown!=nullptr);
 delete tail; head->next=nullptr; shared=nullptr; delete head; head=nullptr;
}`, '7:9:1');
    expect(analysis.capabilities).toContain('references');
    const snapshots = steps.filter(step => step.step_event === 'SET_REFERENCES').map(step => buildTraceState(steps, step.step).references!);
    expect(snapshots.some(snapshot => snapshot.objects.some(object => object.fields.some(field => field.value === '9')))).toBe(true);
    expect(snapshots.some(snapshot => snapshot.objects.some(object => object.status === 'unobserved'))).toBe(true);
    expect(snapshots.some(snapshot => snapshot.objects.some(object => object.status === 'released'))).toBe(true);
    const linked = snapshots.find(snapshot => snapshot.objects.filter(object => object.fields.some(field => field.target)).length >= 2)!;
    expect(linked).toBeDefined();
    const index = steps.findIndex(step => step.step_event === 'SET_REFERENCES');
    const replay = createTraceReplay(steps);
    replay(steps.length - 1);
    expect(replay(index).references).toEqual(buildTraceState(steps, index).references);
  });

  it('expands initialized aggregates and containers without reading uninitialized, reference, volatile or private fields', () => {
    const { steps } = run(`
namespace model { struct Record { int missing; int safe=4; volatile int device; int* next=nullptr; }; }
class Hidden { int secret=9; };
struct Ref { int& alias; };
int main() {
 model::Record pending; model::Record ready{8,4,3,nullptr};
 vector<model::Record> records(1); Hidden hidden;
 int unread; Ref reference{unread};
 cout << ready.missing << ':' << pending.safe << ':' << records[0].safe;
}`, '8:4:4');
    const items = (name: string) => steps.filter(step => step.step_event === 'SET_STRUCT' && step.data?.name === name).flatMap(step => step.data?.items as string[]);
    expect(items('pending')).toContain('missing = inicialização não confirmada');
    expect(items('ready')).toContain('missing = 8');
    expect(items('ready')).toContain('device = valor volatile não expandido');
    expect(items('reference')).toContain('alias = referência não expandida');
    expect(items('hidden')).toEqual([]);
  });

  it('does not copy noncopyable records or invoke custom comparators while inspecting stacks, queues and heaps', () => {
    const { steps } = run(`
struct Item { int value=0; Item(int n):value(n) {} Item(const Item&)=delete; Item(Item&&)=default; };
struct Entry { int value=0; };
int comparisons=0;
struct Compare { bool operator()(const Entry& a,const Entry& b) const { ++comparisons; return a.value<b.value; } };
int main() {
 stack<Item> s; s.emplace(6); queue<Item> q; q.emplace(7);
 priority_queue<Entry,vector<Entry>,Compare> heap; heap.push(Entry{3}); heap.push(Entry{8});
 int before=comparisons;
 cout << s.top().value << ':' << q.front().value << ':' << heap.top().value << ':' << (before==comparisons);
}`, '6:7:8:1');
    expect(steps.some(step => step.step_event === 'SET_STRUCT' && step.data?.name === 's')).toBe(true);
    expect(steps.some(step => step.step_event === 'SET_STRUCT' && step.data?.name === 'q')).toBe(true);
    expect(steps.some(step => step.step_event === 'SET_STRUCT' && step.data?.name === 'heap' && step.data?.kind === 'priority_heap')).toBe(true);
  });

  it('supports different template instantiations and discarded if constexpr branches', () => {
    const { steps } = run(`
template<class T> T twice(T value) { if constexpr(is_arithmetic_v<T>) return value+value; else return value+value; }
template<class T> void order(vector<T>& a) { if constexpr(is_arithmetic_v<T>) sort(a.begin(),a.end()); }
int main() { vector<int> a{3,1,2}; order(a); cout << twice(4) << ':' << twice(string("x")) << ':' << a[0]; }
`, '8:xx:1');
    expect(steps.some(step => step.step_event === 'CALL_ENTER' && step.data?.function === 'twice')).toBe(true);
    expect(buildVectorsState(steps, steps.length - 1).vectors.find(vector => vector.name === 'a')?.items.map(item => item.value)).toEqual([1, 2, 3]);
  });

  it('preserves static_assert and captures only runtime constexpr recursion with balanced calls', () => {
    const { steps } = run(`
constexpr long long factorial(int n) { return n<=1 ? 1 : n*factorial(n-1); }
static_assert(factorial(5)==120);
constexpr int constant=factorial(4);
int main() { int n=5; cout << factorial(n) << ':' << constant; }
`, '120:24');
    const enters = steps.filter(step => step.step_event === 'CALL_ENTER' && step.data?.function === 'factorial');
    const exits = steps.filter(step => step.step_event === 'CALL_EXIT' && step.data?.function === 'factorial');
    expect(enters).toHaveLength(5);
    expect(exits).toHaveLength(5);
    expect(buildTraceState(steps).calls.every(call => call.status === 'returned')).toBe(true);
  });

  it('captures goto labels, safe readiness across skipped declarations, catch parameters and exception exits', () => {
    const { steps } = run(`
void fail() { throw 7; }
int main() {
 goto assign; int value;
 assign: value=4;
 try { fail(); } catch(int caught) { cout << value << ':' << caught; }
}`, '4:7');
    expect(steps.some(step => step.step_event === 'UNINITIALIZED' && step.data?.name === 'value')).toBe(true);
    expect(steps.some(step => step.data?.caption === 'Rótulo assign')).toBe(true);
    expect(steps.some(step => step.data?.caption === 'Captura de exceção')).toBe(true);
    expect(buildTraceState(steps).calls.find(call => call.function === 'fail')?.status).toBe('threw');
  });

  it('keeps indirect throwing constexpr calls with the caller and balances the call stack', () => {
    const { steps, analysis } = run(`
constexpr int inner(int n) { return n ? throw 7 : 0; }
constexpr int outer(int n) { return inner(n); }
static_assert(outer(0)==0);
int next(int n) { return n+1; }
int main() { int n=1; try { outer(n); } catch(int value) { cout << value << ':' << next(2); } }
`, '7:3');
    expect(analysis.warnings.some((warning: string) => warning.includes('Constexpr'))).toBe(true);
    expect(steps.some(step => step.step_event === 'CALL_ENTER' && step.data?.function === 'outer')).toBe(false);
    expect(buildTraceState(steps).calls.every(call => call.status !== 'active')).toBe(true);
    expect(buildTraceState(steps).calls.find(call => call.function === 'next')?.depth).toBe(2);
  });

  it.each([
    ['unique ownership', `Node* p=new Node{3}; { unique_ptr<Node> owner(p); owner.reset(); } cout << (p!=nullptr);`],
    ['explicit destruction', `Node* p=new Node{3}; p->~Node(); ::operator delete(p); cout << (p!=nullptr);`],
    ['placement construction', `alignas(Node) char memory[sizeof(Node)]; Node* p=new(memory) Node{3}; p->~Node(); cout << (p!=nullptr);`],
  ])('keeps %s references opaque when their lifetime cannot be tracked', (_name, body) => {
    const { steps, analysis } = run(`struct Node { int value=0; }; int main() { ${body} }`, '1');
    expect(analysis.warnings.some((warning: string) => warning.includes('alocações não são expandidas'))).toBe(true);
    expect(steps.filter(step => step.step_event === 'SET_REFERENCES').every(step => (step.data?.objects as { fields: unknown[] }[]).every(object => object.fields.length === 0))).toBe(true);
  });

  it('keeps stack objects opaque between explicit destruction and placement reconstruction', () => {
    const { steps, analysis } = run(`
struct Life { string label="long enough to allocate string storage"; };
int main() { Life value; cout << value.label << ':'; value.~Life(); new(&value) Life; cout << value.label; }
`, 'long enough to allocate string storage:long enough to allocate string storage');
    expect(analysis.warnings.some((warning: string) => warning.includes('containers permanecem opacos'))).toBe(true);
    expect(steps.some(step => step.step_event === 'SET_STRUCT' && step.data?.name === 'value')).toBe(false);
  });
});
