import { DEFAULT_CPP_CODE } from './cppTemplate';

export const STUDY_STORAGE_KEY = 'runspect.study.v1';
export const MAX_PROJECT_BYTES = 512 * 1024;
const MAX_CODE_BYTES = 160 * 1024;
const MAX_STDIN_BYTES = 64 * 1024;

export interface StudyProject {
  format: 'runspect-study';
  version: 1;
  code: string;
  stdin: string;
  completed: string[];
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

export function parseStudyProject(source: string): StudyProject {
  if (new TextEncoder().encode(source).length > MAX_PROJECT_BYTES) throw new Error('O projeto excede 512 KiB.');
  let value: unknown;
  try { value = JSON.parse(source); } catch { throw new Error('Arquivo inválido. Abra um projeto JSON exportado pelo Runspect.'); }
  if (!value || typeof value !== 'object') throw new Error('Projeto inválido.');
  const project = value as Record<string, unknown>;
  if (project.format !== 'runspect-study' || project.version !== 1) throw new Error('Formato ou versão de projeto não suportado.');
  if (typeof project.code !== 'string' || typeof project.stdin !== 'string') throw new Error('O projeto precisa conter código e entrada em texto.');
  validateProgram(project.code, project.stdin);
  if (!Array.isArray(project.completed) || project.completed.length > 200 || !project.completed.every(id => typeof id === 'string' && /^[a-z0-9-]{1,80}$/.test(id))) {
    throw new Error('O progresso do projeto é inválido.');
  }
  return { format: 'runspect-study', version: 1, code: project.code, stdin: project.stdin, completed: [...new Set(project.completed as string[])] };
}

export function serializeStudyProject(project: StudyProject): string {
  return JSON.stringify(project, null, 2);
}

export function matchesSampleOutput(actual: string, expected: string): boolean {
  const tokens = (text: string) => text.trim().split(/\s+/).join(' ');
  return tokens(actual) === tokens(expected);
}

export function normalizeSearch(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim();
}
