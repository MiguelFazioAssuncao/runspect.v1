'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, X } from 'lucide-react';
import { downloadFile } from '@/lib/export';
import { useLocale } from '@/lib/i18n';
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
  const { tr } = useLocale();
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
      setNotice(tr('Download solicitado. Você pode ajustar as opções e baixar novamente.', 'Download started. You can adjust options and download again.'));
    } catch {
      setNotice(tr('Não foi possível iniciar o download. Tente novamente.', 'Could not start download. Please try again.'));
    }
  };

  return (
    <dialog ref={dialogRef} className="svg-export-dialog" aria-labelledby="svg-export-title" onCancel={(event) => { event.preventDefault(); onClose(); }}>
      <header className="svg-export-header">
        <div><h2 id="svg-export-title">{tr('Exportar grafo em SVG', 'Export graph as SVG')}</h2><p>{snapshot.title}</p></div>
        <button type="button" className="toolbar-button" aria-label={tr('Fechar exportação SVG', 'Close SVG export')} onClick={onClose}><X className="h-4 w-4" /></button>
      </header>
      <div className="svg-export-body">
        <div className={`svg-export-preview svg-export-preview-${options.background}`}>
          {/* eslint-disable-next-line @next/next/no-img-element -- Local vector preview retains its exact SVG content. */}
          <img src={preview} alt={tr('Prévia do grafo exportado', 'Exported graph preview')} />
        </div>
        <div className="svg-export-options">
          <label>{tr('Enquadramento', 'Framing')}<select value={options.scope} onChange={(event) => change({ scope: event.target.value as SvgExportOptions['scope'] })}>
            <option value="graph">{tr('Grafo completo', 'Full graph')}</option><option value="viewport">{tr('Recorte atual da tela', 'Current viewport')}</option>
          </select></label>
          <label>{tr('Fundo', 'Background')}<select value={options.background} onChange={(event) => change({ background: event.target.value as SvgExportOptions['background'] })}>
            <option value="dark">{tr('Escuro', 'Dark')}</option><option value="light">{tr('Branco', 'Light')}</option><option value="transparent">{tr('Transparente', 'Transparent')}</option>
          </select></label>
          <label>{tr('Tamanho', 'Scale')}<select value={options.scale} onChange={(event) => change({ scale: Number(event.target.value) as SvgExportOptions['scale'] })}>
            <option value={1}>{tr('Original (1×)', 'Original (1×)')}</option><option value={2}>{tr('Dobro (2×)', 'Double (2×)')}</option><option value={4}>{tr('Quádruplo (4×)', 'Quadruple (4×)')}</option>
          </select></label>
          <p className="svg-export-hint">{file.width} × {file.height} px · {tr('vetorial, sem perda ao ampliar.', 'vector format, lossless scaling.')}</p>
          <label>{tr('Nome do arquivo', 'File name')}<input value={filename} maxLength={150} onChange={(event) => { setFilename(event.target.value); setNotice(''); }} /></label>
          <p className="svg-export-hint svg-export-filename">{svgFilename(filename)}</p>
          <label className="svg-export-checkbox"><input type="checkbox" checked={options.includeDescription} disabled={!snapshot.description} onChange={(event) => change({ includeDescription: event.target.checked })} />{tr('Incluir descrição do passo nos metadados', 'Include step description in metadata')}</label>
          <p className="svg-export-hint">{tr('Exporta o passo atual do grafo. Vetores, estruturas e painéis de análise ficam fora do arquivo.', 'Exports the current graph frame. Vectors, structures, and analysis panels are excluded.')}</p>
        </div>
      </div>
      <footer className="svg-export-footer">
        <p role="status">{notice}</p>
        <button type="button" className="toolbar-button" onClick={onClose}>{tr('Cancelar', 'Cancel')}</button>
        <button type="button" className="toolbar-button svg-export-download" onClick={download}><Download className="h-4 w-4" /> {tr('Baixar SVG', 'Download SVG')}</button>
      </footer>
    </dialog>
  );
}
