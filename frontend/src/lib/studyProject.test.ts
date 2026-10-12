import { describe, expect, it } from 'vitest';
import { DEFAULT_STUDY_PROJECT, matchesSampleOutput, normalizeSearch, parseStudyProject, serializeStudyProject, validateProgram } from './studyProject';
import { examples } from './examples';
import { learningGuides, learningPaths } from './learning';

describe('portable study projects', () => {
  it('round-trips code, exact input and deduplicated progress', () => {
    const project = { ...DEFAULT_STUDY_PROJECT, code: '// ação\nint main() {}', stdin: '  1\r\n2\n', completed: ['binary-search', 'binary-search'] };
    expect(parseStudyProject(serializeStudyProject(project))).toEqual({ ...project, completed: ['binary-search'] });
  });
  it.each(['null', '[]', '{}', 'not JSON', '{"format":"runspect-study","version":2}'])('rejects invalid imports without silently replacing a draft: %s', source => {
    expect(() => parseStudyProject(source)).toThrow();
  });
  it('validates fields and limits in UTF-8 bytes', () => {
    expect(() => validateProgram('a'.repeat(160 * 1024), '')).not.toThrow();
    expect(() => validateProgram('á'.repeat(100 * 1024), '')).toThrow('160 KiB');
    expect(() => validateProgram('', 'x'.repeat(64 * 1024 + 1))).toThrow('64 KiB');
    expect(() => parseStudyProject(JSON.stringify({ ...DEFAULT_STUDY_PROJECT, completed: [4] }))).toThrow();
    expect(() => parseStudyProject(JSON.stringify({ ...DEFAULT_STUDY_PROJECT, stdin: null }))).toThrow();
  });
  it('compares output without losing large integer precision or sign', () => {
    expect(matchesSampleOutput('1  2\r\n3\n', '1\n2 3')).toBe(true);
    expect(matchesSampleOutput('', '\n')).toBe(true);
    expect(matchesSampleOutput('9007199254740993', '9007199254740992')).toBe(false);
    expect(matchesSampleOutput('-1', '1')).toBe(false);
  });
  it('supports accent-insensitive searches', () => {
    expect(normalizeSearch('  Árvore BINÁRIA ')).toBe('arvore binaria');
  });
});

describe('learning catalog consistency', () => {
  it('offers a guide and a single learning path for every runnable example', () => {
    const ids = examples.map(example => example.id).sort();
    expect(Object.keys(learningGuides).sort()).toEqual(ids);
    expect(learningPaths.flatMap(path => path.ids).sort()).toEqual(ids);
  });
});
