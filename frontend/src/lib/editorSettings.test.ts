import { describe, expect, it } from 'vitest';
import { DEFAULT_EDITOR_SETTINGS, buildEditorOptions, buildEditorTheme, importEditorSettings, normalizeEditorSettings, parseAdvancedOptions, serializeEditorSettings } from './editorSettings';

describe('browser editor preferences', () => {
  it('round trips a complete customized configuration without losing advanced options', () => {
    const settings = { ...DEFAULT_EDITOR_SETTINGS, fontSize: 20, tabSize: 2, customColors: true, colors: { ...DEFAULT_EDITOR_SETTINGS.colors, keyword: '#ff1234' }, advancedOptions: { minimap: { maxColumn: 80 }, rulers: [80, 120] } };
    expect(importEditorSettings(serializeEditorSettings(settings))).toEqual(settings);
  });

  it('recovers invalid individual fields while keeping valid preferences', () => {
    const normalized = normalizeEditorSettings({ fontSize: 1000, tabSize: 1.5, theme: 'unknown', minimap: 'false', padding: NaN, fontFamily: '', cursorWidth: 4, colors: { background: 'invalid', keyword: '#ff1234' }, advancedOptions: { readOnly: true } });
    expect(normalized.fontSize).toBe(DEFAULT_EDITOR_SETTINGS.fontSize);
    expect(normalized.tabSize).toBe(4);
    expect(normalized.theme).toBe('vs-dark');
    expect(normalized.minimap).toBe(false);
    expect(normalized.padding).toBe(DEFAULT_EDITOR_SETTINGS.padding);
    expect(normalized.fontFamily).toBe(DEFAULT_EDITOR_SETTINGS.fontFamily);
    expect(normalized.cursorWidth).toBe(4);
    expect(normalized.colors.background).toBe(DEFAULT_EDITOR_SETTINGS.colors.background);
    expect(normalized.colors.keyword).toBe('#ff1234');
    expect(normalized.advancedOptions).toEqual({});
  });

  it('rejects unrelated exports and unsupported versions', () => {
    for (const source of ['invalid', '[]', '{}', '{"version":2,"settings":{}}', '{"version":1,"settings":[]}']) {
      expect(() => importEditorSettings(source)).toThrow();
    }
  });

  it('requires an advanced JSON object and protects the integration at every nested level', () => {
    for (const source of ['[]', 'null', '2', '{"automaticLayout":false}', '{"model":null}', '{"theme":"vs"}', '{"readOnly":true}', '{"minimap":{"__proto__":{}}}', '{"constructor":{}}']) {
      expect(() => parseAdvancedOptions(source)).toThrow();
    }
    expect(parseAdvancedOptions('{"mouseWheelScrollSensitivity":2}')).toEqual({ mouseWheelScrollSensitivity: 2 });
  });

  it('merges nested overrides without discarding panel choices and restores base options when removed', () => {
    const settings = { ...DEFAULT_EDITOR_SETTINGS, tabSize: 2, minimap: true, minimapSide: 'left' as const, ruler: 100, advancedOptions: { minimap: { maxColumn: 80 }, fontSize: 18 } };
    const options = buildEditorOptions(settings);
    expect(options.minimap).toMatchObject({ enabled: true, side: 'left', maxColumn: 80 });
    expect(options.tabSize).toBe(2);
    expect(options.detectIndentation).toBe(false);
    expect(options.rulers).toEqual([100]);
    expect(options.fontSize).toBe(18);
    expect(options.automaticLayout).toBe(true);
    expect(options.readOnly).toBe(false);
    expect(buildEditorOptions({ ...settings, advancedOptions: {} }).fontSize).toBe(13);
  });

  it('builds an inherited theme from the saved colors and base theme', () => {
    const theme = buildEditorTheme({ ...DEFAULT_EDITOR_SETTINGS, theme: 'vs', colors: { ...DEFAULT_EDITOR_SETTINGS.colors, keyword: '#ff1234' } });
    expect(theme.base).toBe('vs');
    expect(theme.inherit).toBe(true);
    expect(theme.colors['editor.background']).toBe('#1e1e1e');
    expect(theme.rules).toContainEqual({ token: 'keyword', foreground: 'ff1234' });
  });

  it('does not mutate shared defaults when normalizing colors', () => {
    normalizeEditorSettings({ colors: { background: '#123456' } });
    expect(DEFAULT_EDITOR_SETTINGS.colors.background).toBe('#1e1e1e');
    expect(normalizeEditorSettings(null)).toEqual(DEFAULT_EDITOR_SETTINGS);
  });
});
