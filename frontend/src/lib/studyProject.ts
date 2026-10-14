import { DEFAULT_CPP_CODE } from './cppTemplate';

export const STUDY_STORAGE_KEY = 'runspect.study.v1';
export const MAX_PROJECT_BYTES = 512 * 1024;
const MAX_CODE_BYTES = 160 * 1024;
const MAX_STDIN_BYTES = 64 * 1024;
const PROJECT_ID = /^[a-z0-9-]{1,80}$/;

export interface ProgramDraft {
  code: string;
  stdin: string;
}

export interface StudyProject {
  format: 'runspect-study';
  version: 1;
  code: string;
  stdin: string;
  completed: string[];
  exampleDrafts?: Record<string, ProgramDraft>;
}

export const DEFAULT_STUDY_PROJECT: StudyProject = {
  format: 'runspect-study', version: 1, code: DEFAULT_CPP_CODE, stdin: '', completed: [],
};

export function validateProgram(code: string, stdin: string): void {
  const encoder = new TextEncoder();
  if (encoder.encode(code).length > MAX_CODE_BYTES) throw new Error('O código excede 160 KiB. Use um programa menor.');
  if (encoder.encode(stdin).length > MAX_STDIN_BYTES) throw new Error('A entrada excede 64 KiB. Use um caso de teste menor.');
  if (encoder.encode(JSON.stringify({ code, stdin })).length > 255 * 1024) throw new Error('Código e entrada excedem o limite da requisição. Use um programa menor.');
}

function validateExampleDrafts(value: unknown): Record<string, ProgramDraft> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Os rascunhos das técnicas são inválidos.');
  const entries = Object.entries(value);
  if (entries.length > 200) throw new Error('O projeto contém rascunhos demais.');
  return Object.fromEntries(entries.map(([id, draft]) => {
    if (!PROJECT_ID.test(id) || !draft || typeof draft !== 'object' || Array.isArray(draft)) throw new Error('Os rascunhos das técnicas são inválidos.');
    const program = draft as Record<string, unknown>;
    if (typeof program.code !== 'string' || typeof program.stdin !== 'string') throw new Error('Cada rascunho precisa conter código e entrada em texto.');
    validateProgram(program.code, program.stdin);
    return [id, { code: program.code, stdin: program.stdin }];
  }));
}

export function parseStudyProject(source: string): StudyProject {
  if (new TextEncoder().encode(source).length > MAX_PROJECT_BYTES) throw new Error('O projeto excede 512 KiB.');
  let value: unknown;
  try { value = JSON.parse(source); } catch { throw new Error('Arquivo inválido. Abra um projeto JSON exportado pelo Runspect.'); }
  if (!value || typeof value !== 'object') throw new Error('Projeto inválido.');
  const project = value as Record<string, unknown>;
  if (project.format !== 'runspect-study' || project.version !== 1) throw new Error('Formato ou versão de projeto não suportado.');
  if (typeof project.code !== 'string' || typeof project.stdin !== 'string') throw new Error('O projeto precisa conter código e entrada em texto.');
  validateProgram(project.code, project.stdin);
  if (!Array.isArray(project.completed) || project.completed.length > 200 || !project.completed.every(id => typeof id === 'string' && PROJECT_ID.test(id))) {
    throw new Error('O progresso do projeto é inválido.');
  }
  return {
    format: 'runspect-study', version: 1, code: project.code, stdin: project.stdin,
    completed: [...new Set(project.completed as string[])],
    ...(project.exampleDrafts !== undefined ? { exampleDrafts: validateExampleDrafts(project.exampleDrafts) } : {}),
  };
}

export function serializeStudyProject(project: StudyProject): string {
  validateProgram(project.code, project.stdin);
  if (project.exampleDrafts !== undefined) validateExampleDrafts(project.exampleDrafts);
  const source = JSON.stringify(project, null, 2);
  if (new TextEncoder().encode(source).length > MAX_PROJECT_BYTES) throw new Error('O projeto excede 512 KiB. Reduza os rascunhos ou baixe o código separadamente.');
  return source;
}

export function matchesSampleOutput(actual: string, expected: string): boolean {
  const tokens = (text: string) => text.trim().split(/\s+/).join(' ');
  return tokens(actual) === tokens(expected);
}

export function normalizeSearch(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim();
}
