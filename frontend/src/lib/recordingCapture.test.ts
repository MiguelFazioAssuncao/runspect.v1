import { afterEach, describe, expect, it, vi } from 'vitest';
import { recordingStyleSheet } from './recordingCapture';
class Media { type = 4; constructor(readonly conditionText: string, readonly cssRules: unknown[]) {} }
class Supports { type = 12; constructor(readonly conditionText: string, readonly cssRules: unknown[]) {} }
afterEach(() => vi.unstubAllGlobals());
describe('CSS da captura', () => {
  it('preserva declarações CSSStyleRule mesmo com cssRules de CSS nesting', () => {
    vi.stubGlobal('CSSRule', {STYLE_RULE:1,FONT_FACE_RULE:5});
    vi.stubGlobal('CSSMediaRule', Media); vi.stubGlobal('CSSSupportsRule', Supports);
    vi.stubGlobal('matchMedia', (condition: string) => ({matches:condition === '(min-width: 901px)'}));
    vi.stubGlobal('CSS', {supports: () => true});
    const style = {type:1, cssText:'.vector-cell { display: flex; color: red; }', cssRules:[]};
    const rules = [style, {type:5,cssText:'@font-face {src:url(external);}'},new Media('(min-width: 901px)',[style]),new Media('(max-width: 900px)',[{...style,cssText:'MOBILE'}]), {type:0,cssText:'@layer visual {ignored}',cssRules:[style]},new Supports('(display: flex)',[style])];
    const sheet = {disabled:false,media:{mediaText:''},cssRules:rules};
    vi.stubGlobal('document', {styleSheets:[sheet, {get cssRules() {throw new Error('CORS');},media:{mediaText:''}}]});
    const css = recordingStyleSheet();
    expect(css).toContain(style.cssText);
    expect(css).toContain(`@layer visual {${style.cssText}}`);
    expect(css).not.toContain('MOBILE'); expect(css).not.toContain('external');
  });
});
