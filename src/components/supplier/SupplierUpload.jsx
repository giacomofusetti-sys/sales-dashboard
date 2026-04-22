import { useState, useRef } from 'react';
import { useSupplierData } from '../../hooks/useSupplierData';
import { extractPdfLines } from '../../utils/pdfExtract';
import { parseByType } from '../../utils/supplierParsers';

const UPLOAD_TYPES = [
  { id: 'OV',         label: 'OV',         sub: 'Ordini Vendita' },
  { id: 'OL',         label: 'OL',         sub: 'Ordini Lavorazione' },
  { id: 'OA',         label: 'OA',         sub: 'Ordini Acquisto' },
  { id: 'OP',         label: 'OP',         sub: 'Ordini Produzione' },
  { id: 'ACCIAIERIA', label: 'ACCIAIERIA', sub: 'Ordini Acciaieria' },
];

export default function SupplierUpload() {
  const { importData, importing } = useSupplierData();
  const [results, setResults] = useState({});     // { [type]: [resultRow, ...] }
  const [progress, setProgress] = useState(null); // { type, file, phase, detail }
  const ovRef = useRef(null);
  const olRef = useRef(null);
  const oaRef = useRef(null);
  const opRef = useRef(null);
  const accRef = useRef(null);
  const refs = { OV: ovRef, OL: olRef, OA: oaRef, OP: opRef, ACCIAIERIA: accRef };

  const handleFiles = async (files, forceType) => {
    const newResults = [];

    for (const file of files) {
      try {
        setProgress({ type: forceType, file: file.name, phase: 'pdf', detail: 'Apertura...' });
        const lines = await extractPdfLines(file, ({ current, total }) => {
          setProgress({ type: forceType, file: file.name, phase: 'pdf', detail: `pagina ${current}/${total}` });
        });
        if (!lines.length) {
          newResults.push({ file: file.name, error: 'Nessun testo estratto dal PDF' });
          continue;
        }

        setProgress({ type: forceType, file: file.name, phase: 'parse', detail: 'analisi...' });
        const parsed = parseByType(lines, forceType);
        setProgress({ type: forceType, file: file.name, phase: 'parse', detail: `trovati ${parsed.length} ordini` });

        console.log(`[SupplierUpload] file="${file.name}" type="${forceType}", ${parsed.length} orders`);

        const saveProgress = ({ current, total }) => {
          setProgress({ type: forceType, file: file.name, phase: 'save', detail: `${current}/${total} ordini` });
        };

        const result = await importData(forceType, parsed, saveProgress);
        newResults.push({
          file: file.name,
          type: forceType,
          orders: result.totalOrders,
          ordersWithMats: result.ordersWithMaterials,
          materials: result.totalMaterials,
          refs: result.totalRefs,
        });
      } catch (err) {
        console.error('[SupplierUpload]', err);
        newResults.push({ file: file.name, error: err.message });
      }
    }

    setProgress(null);
    setResults(prev => ({ ...prev, [forceType]: newResults }));
  };

  const onInputChange = (type) => (e) => {
    const files = [...e.target.files];
    if (files.length) handleFiles(files, type);
    e.target.value = '';
  };

  const onDrop = (type) => (e) => {
    e.preventDefault();
    if (busy) return;
    const files = [...e.dataTransfer.files].filter(f => f.type === 'application/pdf');
    if (files.length) handleFiles(files, type);
  };

  const busy = !!(progress || importing);

  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.7px', color: 'var(--text-tertiary)', marginBottom: 14 }}>
        Carica PDF ordini da Embyon
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, marginBottom: 12 }}>
        {UPLOAD_TYPES.map(t => {
          const isActive = progress?.type === t.id;
          const typeResults = results[t.id] || [];
          return (
            <div key={t.id}>
              <button
                disabled={busy}
                onClick={() => refs[t.id].current?.click()}
                onDrop={onDrop(t.id)}
                onDragOver={e => e.preventDefault()}
                style={{
                  width: '100%',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  gap: 4, padding: '18px 10px',
                  border: `2px dashed ${isActive ? 'var(--accent)' : 'var(--border-mid)'}`,
                  borderRadius: 'var(--radius-lg)',
                  background: 'var(--bg-subtle)', color: 'var(--text-primary)',
                  fontFamily: 'var(--font-serif)',
                  cursor: busy ? 'default' : 'pointer',
                  opacity: busy && !isActive ? 0.5 : 1,
                  transition: 'border-color 0.15s, opacity 0.15s',
                }}
              >
                <span style={{ fontSize: 20 }}>📄</span>
                <span style={{ fontSize: 15, fontWeight: 700 }}>{t.label}</span>
                <span style={{ fontSize: 10, fontFamily: 'inherit', fontWeight: 400, color: 'var(--text-tertiary)', textAlign: 'center' }}>
                  {t.sub}
                </span>
              </button>
              <input
                ref={refs[t.id]}
                type="file"
                accept=".pdf"
                multiple
                onChange={onInputChange(t.id)}
                style={{ display: 'none' }}
              />

              {/* Status under button */}
              <div style={{ marginTop: 8, fontSize: 12, minHeight: 38 }}>
                {isActive ? (
                  <div style={{ color: 'var(--text-secondary)' }}>
                    <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {progress.file}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                      {progress.phase === 'pdf' && <>Lettura PDF — {progress.detail}</>}
                      {progress.phase === 'parse' && <>Parsing — {progress.detail}</>}
                      {progress.phase === 'save' && <>Salvataggio — {progress.detail}</>}
                    </div>
                    <div style={{ marginTop: 4, height: 2, borderRadius: 1, background: 'var(--border)', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', borderRadius: 1, background: 'var(--accent)',
                        transition: 'width 0.2s',
                        width: progress.phase === 'pdf' ? '33%' : progress.phase === 'parse' ? '60%' : '90%',
                      }} />
                    </div>
                  </div>
                ) : typeResults.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {typeResults.map((r, i) => (
                      <div key={i} style={{
                        fontSize: 11,
                        padding: '4px 8px',
                        borderRadius: 'var(--radius-sm)',
                        border: `1px solid ${r.error ? 'var(--red-border)' : 'var(--green-border)'}`,
                        background: r.error ? 'var(--red-bg)' : 'var(--green-bg)',
                      }}>
                        <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {r.file}
                        </div>
                        {r.error ? (
                          <div style={{ color: 'var(--red)' }}>{r.error}</div>
                        ) : (
                          <div style={{ color: 'var(--green)' }}>
                            {r.orders} ordini ({r.ordersWithMats} con materiali) · {r.materials} mat. · {r.refs} rif.
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ color: 'var(--text-tertiary)', fontSize: 11, textAlign: 'center', paddingTop: 6 }}>
                    Clicca o trascina qui il PDF
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
