import type { editor } from 'monaco-editor';

export const EDITOR_SETTINGS_KEY = 'runspect.editor.preferences.v1';
export const EDITOR_SETTINGS_VERSION = 1;
export const CUSTOM_EDITOR_THEME = 'runspect-custom';

export interface EditorSettings {
  theme: 'vs-dark' | 'vs' | 'hc-black' | 'hc-light';
  customColors: boolean;
  fontFamily: string;
  fontSize: number;
  fontWeight: string;
  fontLigatures: boolean;
  lineHeight: number;
  letterSpacing: number;
  lineNumbers: 'on' | 'off' | 'relative' | 'interval';
  renderWhitespace: 'none' | 'boundary' | 'selection' | 'trailing' | 'all';
  renderLineHighlight: 'none' | 'gutter' | 'line' | 'all';
  minimap: boolean;
  minimapSide: 'right' | 'left';
  minimapScale: number;
  minimapRenderCharacters: boolean;
  folding: boolean;
  showFoldingControls: 'always' | 'never' | 'mouseover';
  stickyScroll: boolean;
  glyphMargin: boolean;
  wordWrap: 'off' | 'on' | 'wordWrapColumn' | 'bounded';
  wordWrapColumn: number;
  ruler: number;
  padding: number;
  scrollBeyondLastLine: boolean;
  smoothScrolling: boolean;
  mouseWheelZoom: boolean;
  tabSize: number;
  insertSpaces: boolean;
  detectIndentation: boolean;
  autoIndent: 'none' | 'keep' | 'brackets' | 'advanced' | 'full';
  autoClosingBrackets: 'always' | 'languageDefined' | 'beforeWhitespace' | 'never';
  autoClosingQuotes: 'always' | 'languageDefined' | 'beforeWhitespace' | 'never';
  formatOnPaste: boolean;
  formatOnType: boolean;
  trimAutoWhitespace: boolean;
  bracketPairColorization: boolean;
  indentationGuides: boolean;
  bracketPairGuides: boolean;
  cursorStyle: 'line' | 'block' | 'underline' | 'line-thin' | 'block-outline' | 'underline-thin';
  cursorBlinking: 'blink' | 'smooth' | 'phase' | 'expand' | 'solid';
  cursorSmoothCaretAnimation: 'off' | 'explicit' | 'on';
  cursorWidth: number;
  quickSuggestions: boolean;
  suggestOnTriggerCharacters: boolean;
  wordBasedSuggestions: 'off' | 'currentDocument' | 'matchingDocuments' | 'allDocuments';
  snippetSuggestions: 'top' | 'bottom' | 'inline' | 'none';
  acceptSuggestionOnEnter: 'off' | 'on' | 'smart';
  parameterHints: boolean;
  hover: boolean;
  accessibilitySupport: 'auto' | 'on' | 'off';
  colors: Record<ColorKey, string>;
  advancedOptions: Record<string, unknown>;
}

export const COLOR_FIELDS = {
  background: 'Fundo', foreground: 'Texto', keyword: 'Palavras-chave',
  string: 'Strings', number: 'Números', comment: 'Comentários',
  cursor: 'Cursor', selection: 'Seleção', lineHighlight: 'Linha atual', lineNumber: 'Números de linha',
};
export type ColorKey = keyof typeof COLOR_FIELDS;

export type SettingsSection = 'Aparência' | 'Layout' | 'Edição' | 'Cursor' | 'Sugestões';
export interface EditorFieldDefinition {
  label: string;
  section: SettingsSection;
  default: string | number | boolean;
  choices?: readonly (readonly [string, string])[];
  min?: number;
  max?: number;
  step?: number;
  hint?: string;
}
type FieldDefinition = EditorFieldDefinition;
const toggle = (label: string, section: SettingsSection, value: boolean, hint?: string): FieldDefinition => ({ label, section, default: value, hint });
const number = (label: string, section: SettingsSection, value: number, min: number, max: number, step = 1, hint?: string): FieldDefinition => ({ label, section, default: value, min, max, step, hint });
const select = (label: string, section: SettingsSection, value: string, choices: FieldDefinition['choices']): FieldDefinition => ({ label, section, default: value, choices });
const closingChoices = [['languageDefined', 'Conforme a linguagem'], ['always', 'Sempre'], ['beforeWhitespace', 'Antes de espaço'], ['never', 'Nunca']] as const;

export const EDITOR_FIELDS = {
  theme: select('Tema base', 'Aparência', 'vs-dark', [['vs-dark', 'Escuro'], ['vs', 'Claro'], ['hc-black', 'Alto contraste escuro'], ['hc-light', 'Alto contraste claro']]),
  customColors: toggle('Usar minhas cores', 'Aparência', false),
  fontFamily: { label: 'Família da fonte', section: 'Aparência', default: 'Consolas, "Courier New", monospace', hint: 'Use fontes instaladas no seu dispositivo, separadas por vírgula.' },
  fontSize: number('Tamanho da fonte', 'Aparência', 13, 8, 40),
  fontWeight: select('Peso da fonte', 'Aparência', 'normal', [['normal', 'Normal'], ['300', 'Leve'], ['500', 'Médio'], ['600', 'Seminegrito'], ['bold', 'Negrito']]),
  fontLigatures: toggle('Ligaduras da fonte', 'Aparência', false, 'Requer uma fonte com ligaduras instalada, como Fira Code.'),
  lineHeight: number('Altura da linha', 'Aparência', 0, 0, 80, 1, '0 usa a altura automática.'),
  letterSpacing: number('Espaçamento entre letras', 'Aparência', 0, -2, 10, 0.5),
  lineNumbers: select('Números de linha', 'Layout', 'on', [['on', 'Absolutos'], ['relative', 'Relativos'], ['interval', 'A cada 10 linhas'], ['off', 'Ocultos']]),
  renderWhitespace: select('Mostrar espaços em branco', 'Layout', 'selection', [['none', 'Nunca'], ['boundary', 'Nas bordas'], ['selection', 'Na seleção'], ['trailing', 'No fim da linha'], ['all', 'Todos']]),
  renderLineHighlight: select('Destaque da linha atual', 'Layout', 'line', [['none', 'Nenhum'], ['gutter', 'Margem'], ['line', 'Linha'], ['all', 'Linha e margem']]),
  minimap: toggle('Mostrar minimapa', 'Layout', false),
  minimapSide: select('Posição do minimapa', 'Layout', 'right', [['right', 'Direita'], ['left', 'Esquerda']]),
  minimapScale: number('Escala do minimapa', 'Layout', 1, 1, 3),
  minimapRenderCharacters: toggle('Caracteres no minimapa', 'Layout', true),
  folding: toggle('Recolher blocos de código', 'Layout', true),
  showFoldingControls: select('Controles de recolhimento', 'Layout', 'mouseover', [['mouseover', 'Ao passar o mouse'], ['always', 'Sempre'], ['never', 'Nunca']]),
  stickyScroll: toggle('Fixar o contexto no topo', 'Layout', true),
  glyphMargin: toggle('Mostrar margem de símbolos', 'Layout', true),
  wordWrap: select('Quebra de linha', 'Layout', 'off', [['off', 'Desativada'], ['on', 'Na largura do editor'], ['wordWrapColumn', 'Na coluna definida'], ['bounded', 'Editor ou coluna definida']]),
  wordWrapColumn: number('Coluna da quebra de linha', 'Layout', 80, 20, 240),
  ruler: number('Régua vertical na coluna', 'Layout', 0, 0, 240, 1, '0 oculta a régua.'),
  padding: number('Espaço no topo e rodapé', 'Layout', 8, 0, 64),
  scrollBeyondLastLine: toggle('Rolar além da última linha', 'Layout', true),
  smoothScrolling: toggle('Rolagem suave', 'Layout', false),
  mouseWheelZoom: toggle('Zoom com Ctrl/Cmd + rolagem', 'Layout', false),
  tabSize: number('Tamanho do recuo', 'Edição', 4, 1, 16),
  insertSpaces: toggle('Usar espaços em vez de tabulações', 'Edição', true),
  detectIndentation: toggle('Detectar recuo pelo conteúdo', 'Edição', false, 'Quando ativo, o arquivo pode substituir o tamanho e o tipo de recuo escolhidos.'),
  autoIndent: select('Recuo automático', 'Edição', 'full', [['none', 'Desativado'], ['keep', 'Manter'], ['brackets', 'Por delimitadores'], ['advanced', 'Avançado'], ['full', 'Completo']]),
  autoClosingBrackets: select('Fechar delimitadores', 'Edição', 'languageDefined', closingChoices),
  autoClosingQuotes: select('Fechar aspas', 'Edição', 'languageDefined', closingChoices),
  formatOnPaste: toggle('Formatar ao colar', 'Edição', false, 'Depende de um formatador disponível para C++.'),
  formatOnType: toggle('Formatar ao digitar', 'Edição', false, 'Depende de um formatador disponível para C++.'),
  trimAutoWhitespace: toggle('Remover espaços automáticos sobrando', 'Edição', true),
  bracketPairColorization: toggle('Colorir pares de delimitadores', 'Edição', true),
  indentationGuides: toggle('Guias de recuo', 'Edição', true),
  bracketPairGuides: toggle('Guias de pares de delimitadores', 'Edição', false),
  cursorStyle: select('Estilo do cursor', 'Cursor', 'line', [['line', 'Linha'], ['line-thin', 'Linha fina'], ['block', 'Bloco'], ['block-outline', 'Contorno de bloco'], ['underline', 'Sublinhado'], ['underline-thin', 'Sublinhado fino']]),
  cursorBlinking: select('Animação do cursor', 'Cursor', 'blink', [['blink', 'Piscar'], ['smooth', 'Suave'], ['phase', 'Desvanecer'], ['expand', 'Expandir'], ['solid', 'Fixo']]),
  cursorSmoothCaretAnimation: select('Movimento suave do cursor', 'Cursor', 'off', [['off', 'Desativado'], ['explicit', 'Ao mover manualmente'], ['on', 'Sempre']]),
  cursorWidth: number('Largura do cursor', 'Cursor', 2, 1, 10),
  quickSuggestions: toggle('Sugestões ao digitar', 'Sugestões', true),
  suggestOnTriggerCharacters: toggle('Sugestões por caracteres de gatilho', 'Sugestões', true),
  wordBasedSuggestions: select('Sugestões de palavras', 'Sugestões', 'currentDocument', [['off', 'Desativadas'], ['currentDocument', 'Documento atual'], ['matchingDocuments', 'Documentos da mesma linguagem'], ['allDocuments', 'Todos os documentos']]),
  snippetSuggestions: select('Posição dos snippets', 'Sugestões', 'inline', [['top', 'No topo'], ['bottom', 'No fim'], ['inline', 'Junto das sugestões'], ['none', 'Ocultos']]),
  acceptSuggestionOnEnter: select('Aceitar sugestão com Enter', 'Sugestões', 'on', [['on', 'Sempre'], ['smart', 'Quando fizer sentido'], ['off', 'Desativado']]),
  parameterHints: toggle('Dicas de parâmetros', 'Sugestões', true),
  hover: toggle('Informações ao passar o mouse', 'Sugestões', true),
  accessibilitySupport: select('Suporte a leitor de tela', 'Sugestões', 'auto', [['auto', 'Automático'], ['on', 'Ativado'], ['off', 'Desativado']]),
} satisfies Record<Exclude<keyof EditorSettings, 'colors' | 'advancedOptions'>, FieldDefinition>;
export type EditorFieldKey = keyof typeof EDITOR_FIELDS;

export const DEFAULT_EDITOR_SETTINGS: EditorSettings = {
  ...Object.fromEntries(Object.entries(EDITOR_FIELDS).map(([key, field]) => [key, field.default])) as Omit<EditorSettings, 'colors' | 'advancedOptions'>,
  colors: { background: '#1e1e1e', foreground: '#d4d4d4', keyword: '#569cd6', string: '#ce9178', number: '#b5cea8', comment: '#6a9955', cursor: '#aeafad', selection: '#264f78', lineHighlight: '#282828', lineNumber: '#858585' },
  advancedOptions: {},
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// These options belong to the integration, rather than browser preferences.
const protectedOptions = new Set(['model', 'value', 'language', 'theme', 'automaticLayout', 'dimension', 'readOnly', 'domReadOnly', 'ariaContainerElement']);
function validateAdvanced(value: unknown, depth = 0): void {
  if (depth > 12) throw new Error('O JSON avançado tem níveis demais.');
  if (isRecord(value)) {
    for (const [key, child] of Object.entries(value)) {
      if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new Error('O JSON contém uma chave inválida.');
      if (depth === 0 && protectedOptions.has(key)) throw new Error(`A opção "${key}" é gerenciada pelo Runspect.`);
      validateAdvanced(child, depth + 1);
    }
  } else if (Array.isArray(value)) value.forEach((child) => validateAdvanced(child, depth + 1));
}

export function parseAdvancedOptions(source: string): Record<string, unknown> {
  let parsed: unknown;
  try { parsed = JSON.parse(source); }
  catch { throw new Error('JSON inválido. Verifique as aspas duplas, vírgulas e chaves.'); }
  if (!isRecord(parsed)) throw new Error('Use um objeto JSON, por exemplo: { "mouseWheelScrollSensitivity": 2 }.');
  validateAdvanced(parsed);
  return parsed;
}

export function normalizeEditorSettings(value: unknown): EditorSettings {
  const result = { ...DEFAULT_EDITOR_SETTINGS, colors: { ...DEFAULT_EDITOR_SETTINGS.colors }, advancedOptions: {} };
  if (!isRecord(value)) return result;
  const fields: Record<string, FieldDefinition> = EDITOR_FIELDS;
  for (const [key, field] of Object.entries(fields)) {
    const candidate = value[key];
    if (typeof candidate !== typeof field.default) continue;
    if (typeof candidate === 'number' && (!Number.isFinite(candidate) || candidate < field.min! || candidate > field.max! || (field.step === 1 && !Number.isInteger(candidate)))) continue;
    if (typeof candidate === 'string' && (!candidate.trim() || candidate.length > 300 || (field.choices && !field.choices.some(([option]) => option === candidate)))) continue;
    Object.assign(result, { [key]: candidate });
  }
  if (isRecord(value.colors)) {
    for (const key of Object.keys(COLOR_FIELDS) as ColorKey[]) {
      const color = value.colors[key];
      if (typeof color === 'string' && /^#[\da-f]{6}$/i.test(color)) result.colors[key] = color;
    }
  }
  if (isRecord(value.advancedOptions)) {
    try { result.advancedOptions = parseAdvancedOptions(JSON.stringify(value.advancedOptions)); } catch { /* Keep usable defaults for corrupted storage. */ }
  }
  return result;
}

export function serializeEditorSettings(settings: EditorSettings): string {
  return JSON.stringify({ version: EDITOR_SETTINGS_VERSION, settings }, null, 2);
}

export function importEditorSettings(source: string): EditorSettings {
  const parsed: unknown = JSON.parse(source);
  if (!isRecord(parsed) || parsed.version !== EDITOR_SETTINGS_VERSION || !isRecord(parsed.settings)) throw new Error('Arquivo de preferências inválido ou versão incompatível.');
  if (parsed.settings.advancedOptions !== undefined) parseAdvancedOptions(JSON.stringify(parsed.settings.advancedOptions));
  return normalizeEditorSettings(parsed.settings);
}

function mergeOptions(base: Record<string, unknown>, override: Record<string, unknown>): Record<string, unknown> {
  const merged = { ...base };
  for (const [key, value] of Object.entries(override)) {
    merged[key] = isRecord(value) && isRecord(base[key]) ? mergeOptions(base[key], value) : value;
  }
  return merged;
}

export function buildEditorOptions(settings: EditorSettings): editor.IStandaloneEditorConstructionOptions {
  const { theme, customColors, colors, advancedOptions, minimap, minimapSide, minimapScale, minimapRenderCharacters, stickyScroll, ruler, padding, bracketPairColorization, indentationGuides, bracketPairGuides, parameterHints, hover, ...options } = settings;
  void theme; void customColors; void colors;
  return {
    ...mergeOptions({
      ...options,
      minimap: { enabled: minimap, side: minimapSide, scale: minimapScale, renderCharacters: minimapRenderCharacters },
      stickyScroll: { enabled: stickyScroll },
      rulers: ruler ? [ruler] : [],
      padding: { top: padding, bottom: padding },
      bracketPairColorization: { enabled: bracketPairColorization },
      guides: { indentation: indentationGuides, bracketPairs: bracketPairGuides },
      parameterHints: { enabled: parameterHints }, hover: { enabled: hover },
    }, advancedOptions),
    automaticLayout: true,
    autoDetectHighContrast: false,
    readOnly: false,
    domReadOnly: false,
  };
}

export function buildEditorTheme(settings: EditorSettings): editor.IStandaloneThemeData {
  const c = settings.colors;
  return {
    base: settings.theme, inherit: true,
    rules: [
      { token: 'keyword', foreground: c.keyword.slice(1) },
      { token: 'string', foreground: c.string.slice(1) },
      { token: 'number', foreground: c.number.slice(1) },
      { token: 'comment', foreground: c.comment.slice(1) },
    ],
    colors: {
      'editor.background': c.background, 'editor.foreground': c.foreground,
      'editorCursor.foreground': c.cursor, 'editor.selectionBackground': c.selection,
      'editor.lineHighlightBackground': c.lineHighlight, 'editorLineNumber.foreground': c.lineNumber,
      'editorGutter.background': c.background, 'minimap.background': c.background,
    },
  };
}
