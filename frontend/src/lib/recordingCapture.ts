import { RECORDING_BG, throwIfRecordingAborted } from './recording';

// The visualization contains local HTML/SVG and embedded fonts. Preserve the
// actual CSS cascade instead of copying hundreds of computed properties on every
// element on every step. Resolve media queries against the application viewport,
// not the smaller SVG viewport used by foreignObject.
export function recordingStyleSheet(): string {
  const rulesCSS = (rules: CSSRuleList): string => Array.from(rules).map(rule => {
    if (rule.type === CSSRule.FONT_FACE_RULE) return '';
    // CSSStyleRule also exposes cssRules in browsers supporting CSS nesting.
    // Its declarations must be retained even when that child list is empty.
    if (rule.type === CSSRule.STYLE_RULE) return rule.cssText;
    if (rule instanceof CSSMediaRule) return matchMedia(rule.conditionText).matches ? rulesCSS(rule.cssRules) : '';
    if (rule instanceof CSSSupportsRule) return CSS.supports(rule.conditionText) ? rulesCSS(rule.cssRules) : '';
    if ('cssRules' in rule) {
      const text = rule.cssText;
      return `${text.slice(0, text.indexOf('{') + 1)}${rulesCSS((rule as CSSGroupingRule).cssRules)}}`;
    }
    return rule.cssText;
  }).join('\n');
  return Array.from(document.styleSheets).map(sheet => {
    try { return !sheet.disabled && (!sheet.media.mediaText || matchMedia(sheet.media.mediaText).matches) ? rulesCSS(sheet.cssRules) : ''; }
    catch { return ''; } // Cross-origin Monaco styles are outside the visualization.
  }).join('\n');
}

export interface RecordingCapture {
  capture: (area: HTMLElement, signals: AbortSignal[]) => Promise<HTMLCanvasElement>;
  dispose: () => void;
}
export function createRecordingCapture(width: number, height: number, bitmapWidth: number, bitmapHeight: number, fontCSS: string): RecordingCapture {
  let css = recordingStyleSheet() + '\n' + fontCSS;
  const activeImages = new Set<HTMLImageElement>();
  let disposed = false;
  return {
    async capture(area, signals) {
      throwIfRecordingAborted(signals);
      if (disposed) throw new Error('A captura já foi encerrada.');
      const started = performance.now();
      const clone = area.cloneNode(true) as HTMLElement;
      clone.style.width = `${width}px`; clone.style.height = `${height}px`;
      const wrapper = document.createElement('div');
      wrapper.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
      wrapper.className = area.parentElement?.className ?? 'recording-stage';
      wrapper.style.cssText = `position:relative;inset:auto;width:${width}px;height:${height}px;padding:0;gap:0;display:flex;flex-direction:column;overflow:hidden;background:${RECORDING_BG}`;
      // These inherited properties originate outside the exported subtree.
      const inherited = getComputedStyle(area);
      for (const property of ['font-family', 'font-size', 'font-weight', 'line-height', 'color', 'letter-spacing', 'text-align', ...Array.from(inherited).filter(name => name.startsWith('--'))]) {
        wrapper.style.setProperty(property, inherited.getPropertyValue(property));
      }
      const style = document.createElement('style'); style.textContent = css;
      wrapper.append(style, clone);
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><foreignObject width="100%" height="100%">${new XMLSerializer().serializeToString(wrapper)}</foreignObject></svg>`;
      performance.measure('recording:serialize', { start: started });
      const image = new Image();
      activeImages.add(image);
      let abort = () => {};
      const canvas = document.createElement('canvas');
      try {
        await new Promise<void>((resolve, reject) => {
          const finish = (error?: unknown) => {
            image.onload = null; image.onerror = null;
            signals.forEach(signal => signal.removeEventListener('abort', abort));
            if (error) reject(error); else resolve();
          };
          abort = () => { const signal = signals.find(item => item.aborted); if (signal) finish(signal.reason ?? new Error('Captura cancelada.')); };
          image.onload = () => finish(); image.onerror = () => finish(new Error('Não foi possível renderizar o quadro SVG.'));
          signals.forEach(signal => signal.addEventListener('abort', abort, { once: true }));
          image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
          abort();
        });
        throwIfRecordingAborted(signals);
        if (disposed) throw new Error('A captura já foi encerrada.');
        canvas.width = bitmapWidth; canvas.height = bitmapHeight;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Não foi possível criar o canvas de captura.');
        context.fillStyle = RECORDING_BG; context.fillRect(0, 0, bitmapWidth, bitmapHeight);
        context.drawImage(image, 0, 0, bitmapWidth, bitmapHeight);
        return canvas;
      } catch (error) {
        canvas.width = 0; canvas.height = 0; throw error;
      } finally {
        image.onload = null; image.onerror = null; image.src = '';
        activeImages.delete(image);
        signals.forEach(signal => signal.removeEventListener('abort', abort));
      }
    },
    dispose() {
      disposed = true; css = '';
      activeImages.forEach(image => { image.src = ''; }); activeImages.clear();
    },
  };
}
