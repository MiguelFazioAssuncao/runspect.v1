const fontName = (value: string) => value.trim().replace(/^['"]|['"]$/g, '').toLowerCase();

// html-to-image scans every stylesheet, including Monaco's unrelated CDN CSS.
// Only read accessible stylesheets and embed fonts used inside the capture.
export async function captureFontCSS(area: HTMLElement, signals: AbortSignal[]): Promise<string> {
  const used = new Set<string>();
  [area, ...Array.from(area.querySelectorAll('*'))].forEach((element) => {
    getComputedStyle(element).fontFamily.split(',').forEach((name) => used.add(fontName(name)));
  });
  const declarations: { css: string; base: string }[] = [];
  const visit = (rules: CSSRuleList, base: string) => {
    Array.from(rules).forEach((rule) => {
      if (rule.type === CSSRule.FONT_FACE_RULE) {
        const face = rule as CSSFontFaceRule;
        if (used.has(fontName(face.style.getPropertyValue('font-family')))) {
          declarations.push({ css: face.cssText, base });
        }
      } else if ('cssRules' in rule) {
        visit((rule as CSSGroupingRule).cssRules, base);
      }
    });
  };
  Array.from(document.styleSheets).forEach((sheet) => {
    try { visit(sheet.cssRules, sheet.href || document.baseURI); } catch {
      // Cross-origin editor styles are not part of the exported visualization.
    }
  });

  const controller = new AbortController();
  const abort = () => {
    const signal = signals.find((item) => item.aborted);
    if (signal) controller.abort(signal.reason);
  };
  signals.forEach((signal) => signal.addEventListener('abort', abort, { once: true }));
  abort();
  const resources = new Map<string, Promise<string>>();
  const embed = (url: string) => {
    let resource = resources.get(url);
    if (!resource) {
      resource = (async () => {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error('Não foi possível carregar uma fonte da visualização.');
        const blob = await response.blob();
        const bytes = new Uint8Array(await blob.arrayBuffer());
        let binary = '';
        for (let i = 0; i < bytes.length; i += 8192) {
          binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
        }
        return `data:${blob.type || 'application/octet-stream'};base64,${btoa(binary)}`;
      })();
      resources.set(url, resource);
    }
    return resource;
  };

  try {
    if (controller.signal.aborted) throw controller.signal.reason;
    const css: string[] = [];
    for (const declaration of declarations) {
      let text = declaration.css;
      const urls = Array.from(text.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*?))\s*\)/g));
      for (const match of urls) {
        const value = (match[1] ?? match[2] ?? match[3]).trim();
        if (value.startsWith('data:')) continue;
        const url = new URL(value, declaration.base).href;
        const data = await embed(url);
        text = text.replace(match[0], `url("${data}")`);
      }
      css.push(text);
    }
    return css.join('\n');
  } finally {
    signals.forEach((signal) => signal.removeEventListener('abort', abort));
  }
}
