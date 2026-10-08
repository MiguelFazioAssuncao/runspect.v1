const visualizerInclude = /^[ \t]*#include\s+"visualizer\.h"[ \t]*\r?\n?/gm;

const OUTPUT_CALLS = new Set(['print']);

const REMOVED_CALLS = new Set([
  'set_directed',
  'set_weighted',
  'set_multigraph',
  'add_node',
  'add_edge',
  'remove_node',
  'remove_edge',
  'set_weight',
  'highlight',
  'highlight_edge',
  'highlight_path',
  'set_label',
  'set_color',
  'reset_colors',
  'set_badge',
  'set_edge_style',
  'set_edge_label',
  'step',
  'show',
  'show_matrix',
  'vector_init',
  'vector_compare',
  'vector_swap',
  'vector_set',
  'vector_mark',
  'vector_range',
  'vector_discard',
  'vector_probe',
  'vector_pivot',
  'vector_reset',
  'vector_step',
  'vector_result',
  'graph_node_state',
  'graph_edge_state',
  'graph_value',
  'graph_component',
  'graph_path',
  'graph_reset',
]);

function skipToken(src: string, i: number): number {
  const c = src[i];
  const n = src[i + 1];
  if (c === '/' && n === '/') {
    const end = src.indexOf('\n', i);
    return end === -1 ? src.length : end;
  }
  if (c === '/' && n === '*') {
    const end = src.indexOf('*/', i + 2);
    return end === -1 ? src.length : end + 2;
  }
  if (c === '"' || c === "'") {
    if (c === '"' && src[i - 1] === 'R') {
      throw new Error('Raw string literals não são suportados na conversão');
    }
    if (c === "'" && /[0-9a-fA-F]/.test(src[i - 1] ?? '')) return i;
    let j = i + 1;
    while (j < src.length && src[j] !== c) j += src[j] === '\\' ? 2 : 1;
    return Math.min(j + 1, src.length);
  }
  return i;
}

interface Call {
  name: string;
  args: string;
  end: number;
}

function readCall(src: string, start: number): Call {
  const fail = () =>
    new Error(`Chamada viz:: não suportada na posição ${start}; use o formato viz::nome(...);`);
  const match = /^viz::([A-Za-z_]\w*)\s*\(/.exec(src.slice(start));
  if (!match) throw fail();
  const open = start + match[0].length - 1;
  let depth = 0;
  let i = open;
  while (i < src.length) {
    const skipped = skipToken(src, i);
    if (skipped > i) {
      i = skipped;
      continue;
    }
    if (src[i] === '(') depth++;
    else if (src[i] === ')' && --depth === 0) break;
    i++;
  }
  if (depth !== 0) throw fail();
  let end = i + 1;
  while (/\s/.test(src[end] ?? '')) end++;
  if (src[end] !== ';') throw fail();
  return { name: match[1], args: src.slice(open + 1, i), end: end + 1 };
}

export function convertToPureCpp(source: string): string {
  const text = source.replace(visualizerInclude, '');
  let out = '';
  let i = 0;
  while (i < text.length) {
    const skipped = skipToken(text, i);
    if (skipped > i) {
      const token = text.slice(i, skipped);
      if (!(token.startsWith('//') && token.includes('viz::'))) out += token;
      i = skipped;
      continue;
    }
    if (text.startsWith('viz::', i) && !/\w/.test(text[i - 1] ?? '')) {
      const call = readCall(text, i);
      if (OUTPUT_CALLS.has(call.name)) {
        out += `cout << (${call.args}) << "\\n";`;
      } else if (REMOVED_CALLS.has(call.name)) {
        const previous = out.trimEnd().slice(-1);
        if (previous === '' || previous === ';' || previous === '{' || previous === '}') {
          out = out.replace(/[ \t]*$/, '');
          i = call.end;
          if (text.startsWith('\r\n', i)) i += 2;
          else if (text[i] === '\n') i += 1;
          continue;
        }
        out += ';';
      } else {
        throw new Error(`viz::${call.name} não é um método conhecido`);
      }
      i = call.end;
      continue;
    }
    out += text[i++];
  }
  return out.replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}