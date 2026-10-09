'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, X } from 'lucide-react';
import { downloadFile } from '@/lib/export';
import { buildSvgExport, svgFilename } from '@/lib/svgExport';
import type { SvgExportOptions, SvgSnapshot } from '@/lib/svgExport';

interface Props {
  snapshot: SvgSnapshot;
  filename: string;
  options: SvgExportOptions;
  onOptionsChange: (options: SvgExportOptions) => void;
  onClose: () => void;
}

export function SvgExportDialog({ snapshot, filename: initialFilename, options, onOptionsChange, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [filename, setFilename] = useState(initialFilename);
  const [notice, setNotice] = useState('');
  const file = useMemo(() => buildSvgExport(snapshot, options), [snapshot, options]);
  const preview = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(file.source)}`;
  const change = (patch: Partial<SvgExportOptions>) => { onOptionsChange({ ...options, ...patch }); setNotice(''); };

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);

  const download = () => {
    try {
      downloadFile(new Blob([file.source], { type: 'image/svg+xml;charset=utf-8' }), svgFilename(filename));
      setNotice('Download solicitado. Você pode ajustar as opções e baixar novamente.');
    } catch {
      setNotice('Não foi possível iniciar o download. Tente novamente.');
    }
  };

  return (
    <dialog ref={dialogRef} className="svg-export-dialog" aria-labelledby="svg-export-title" onCancel={(event) => { event.preventDefault(); onClose(); }}>
      <header className="svg-export-header">
        <div><h2 id="svg-export-title">Exportar grafo em SVG</h2><p>{snapshot.title}</p></div>
        <button type="button" className="toolbar-button" aria-label="Fechar exportação SVG" onClick={onClose}><X className="h-4 w-4" /></button>
      </header>
      <div className="svg-export-body">
        <div className={`svg-export-preview svg-export-preview-${options.background}`}>
          {/* eslint-disable-next-line @next/next/no-img-element -- Local vector preview retains its exact SVG content. */}
          <img src={preview} alt="Prévia do grafo exportado" />
        </div>
        <div className="svg-export-options">
          <label>Enquadramento<select value={options.scope} onChange={(event) => change({ scope: event.target.value as SvgExportOptions['scope'] })}>
            <option value="graph">Grafo completo</option><option value="viewport">Recorte atual da tela</option>
          </select></label>
          <label>Fundo<select value={options.background} onChange={(event) => change({ background: event.target.value as SvgExportOptions['background'] })}>
            <option value="dark">Escuro</option><option value="light">Branco</option><option value="transparent">Transparente</option>
          </select></label>
          <label>Tamanho<select value={options.scale} onChange={(event) => change({ scale: Number(event.target.value) as SvgExportOptions['scale'] })}>
            <option value={1}>Original (1×)</option><option value={2}>Dobro (2×)</option><option value={4}>Quádruplo (4×)</option>
          </select></label>
          <p className="svg-export-hint">{file.width} × {file.height} px · vetorial, sem perda ao ampliar.</p>
          <label>Nome do arquivo<input value={filename} maxLength={150} onChange={(event) => { setFilename(event.target.value); setNotice(''); }} /></label>
          <p className="svg-export-hint svg-export-filename">{svgFilename(filename)}</p>
          <label className="svg-export-checkbox"><input type="checkbox" checked={options.includeDescription} disabled={!snapshot.description} onChange={(event) => change({ includeDescription: event.target.checked })} />Incluir descrição do passo nos metadados</label>
          <p className="svg-export-hint">Exporta o passo atual do grafo. Vetores, estruturas e painéis de análise ficam fora do arquivo.</p>
        </div>
      </div>
      <footer className="svg-export-footer">
        <p role="status">{notice}</p>
        <button type="button" className="toolbar-button" onClick={onClose}>Cancelar</button>
        <button type="button" className="toolbar-button svg-export-download" onClick={download}><Download className="h-4 w-4" /> Baixar SVG</button>
      </footer>
    </dialog>
  );
}
