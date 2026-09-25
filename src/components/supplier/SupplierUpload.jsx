import { useState, useRef } from 'react';
import { useSupplierData } from '../../hooks/useSupplierData';
import { parseSupplierWorkbook } from '../../utils/supplierExcel';
import { importSupplierSnapshot } from '../../utils/supplierDb';

// Import order matters: OV first, then the supplier-side types
const IMPORT_TYPES = [
  { id: 'OV',         label: 'OV' },
  { id: 'OA',         label: 'OA' },
  { id: 'ACCIAIERIA', label: 'Acciaieria' },
  { id: 'OP',         label: 'OP' },
  { id: 'OL',         label: 'OL' },
];

const PHASE_LABELS = {
  read: 'Lettura file',
  parse: 'Analisi',
  save: 'Salvataggio',
  reload: 'Ricarica dati',
};

function guardMessage(err) {
  const msg = err?.message || '';
  if (!msg.startsWith('GUARD:')) return null;
  const nums = msg.match(/\d+/g) || [];
  if (nums.length >= 2) {
    return `Il file contiene ${nums[0]} ordini contro ${nums[1]} in archivio: sembra incompleto. Importare comunque?`;
  }
  return `${msg.slice(6).trim()}\n\nImportare comunque?`;
}

export default function SupplierUpload() {
  const { reloadAll } = useSupplierData();
  const [progress, setProgress] = useState(null); // { phase, detail }
  const [fileName, setFileName] = useState(null);
  const [results, setResults] = useState(null);   // [{ type, label, ...rpcResult | error | skipped }]
  const [warnings, setWarnings] = useState([]);
  const [fatal, setFatal] = useState(null);
  const inputRef = useRef(null);
  const busy = !!progress;

  const handleFile = async (file) => {
    setFileName(file.name);
    setResults(null);
    setWarnings([]);
    setFatal(null);

    let parsed;
    try {
      setProgress({ phase: 'read', detail: file.name });
      const buf = await file.arrayBuffer();
      setProgress({ phase: 'parse', detail: 'lettura fogli OV, OA - OP, OL…' });
      // yield to let the progress render before the synchronous parse
      await new Promise(r => setTimeout(r, 0));
      parsed = parseSupplierWorkbook(buf);
      setWarnings(parsed.warnings);
      console.log('[SupplierUpload] parsed:', IMPORT_TYPES.map(t => `${t.id}=${parsed[t.id].length}`).join(', '));
    } catch (err) {
      console.error('[SupplierUpload] parse error', err);
      setFatal(err.message);
      setProgress(null);
      return;
    }

    const out = [];
    let imported = false;
    for (const t of IMPORT_TYPES) {
      const typeOrders = parsed[t.id];
      setProgress({ phase: 'save', detail: `${t.label} — ${typeOrders.length} ordini` });
      try {
        let res;
        try {
          res = await importSupplierSnapshot(t.id, typeOrders);
        } catch (err) {
          const question = guardMessage(err);
          if (!question) throw err;
          if (!window.confirm(`${t.label}: ${question}`)) {
            out.push({ type: t.id, label: t.label, skipped: true, detail: err.message.slice(6).trim() });
            setResults([...out]);
            continue;
          }
          res = await importSupplierSnapshot(t.id, typeOrders, true);
        }
        imported = true;
        out.push({ type: t.id, label: t.label, ...res });
      } catch (err) {
        console.error(`[SupplierUpload] import ${t.id} failed`, err);
        out.push({ type: t.id, label: t.label, error: err.message });
      }
      setResults([...out]);
    }

    if (imported) {
      setProgress({ phase: 'reload', detail: 'caricamento di tutti gli ordini…' });
      await reloadAll();
    }
    setProgress(null);
  };

  const onInputChange = (e) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  };

  const onDrop = (e) => {
    e.preventDefault();
    if (busy) return;
    const file = [...e.dataTransfer.files].find(f => f.name.toLowerCase().endsWith('.xlsx'));
    if (file) handleFile(file);
  };

  const phases = ['read', 'parse', 'save', 'reload'];
  const phaseIdx = progress ? phases.indexOf(progress.phase) : -1;

  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.7px', color: 'var(--text-tertiary)', marginBottom: 14 }}>
        Carica dati ordini da Embyon
      </div>

      <button
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        onDrop={onDrop}
        onDragOver={e => e.preventDefault()}
        style={{
          width: '100%', maxWidth: 520,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 4, padding: '26px 16px',
          border: `2px dashed ${busy ? 'var(--accent)' : 'var(--border-mid)'}`,
          borderRadius: 'var(--radius-lg)',
          background: 'var(--bg-subtle)', color: 'var(--text-primary)',
          fontFamily: 'var(--font-serif)',
          cursor: busy ? 'default' : 'pointer',
          transition: 'border-color 0.15s',
        }}
      >
        <span style={{ fontSize: 22 }}>📊</span>
        <span style={{ fontSize: 15, fontWeight: 700 }}>Carica Dati.xlsx</span>
        <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-tertiary)' }}>
          Clicca o trascina qui il file (fogli OV, OA - OP, OL)
        </span>
      </button>
      <input ref={inputRef} type="file" accept=".xlsx" onChange={onInputChange} style={{ display: 'none' }} />

      {progress && (
        <div style={{ marginTop: 14, maxWidth: 520, fontSize: 12, color: 'var(--text-secondary)' }}>
          <div style={{ fontWeight: 600 }}>{PHASE_LABELS[progress.phase]} — {progress.detail}</div>
          <div style={{ marginTop: 6, height: 3, borderRadius: 2, background: 'var(--border)', overflow: 'hidden' }}>
            <div style={{
              height: '100%', background: 'var(--accent)', transition: 'width 0.2s',
              width: `${((phaseIdx + 1) / phases.length) * 100}%`,
            }} />
          </div>
        </div>
      )}

      {fatal && (
        <div style={{ marginTop: 14, maxWidth: 520, fontSize: 12, padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--red-border)', background: 'var(--red-bg)', color: 'var(--red)' }}>
          <b>{fileName}</b>: {fatal}
        </div>
      )}

      {results && results.length > 0 && (
        <div style={{ marginTop: 16, overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--bg-subtle)', borderBottom: '1px solid var(--border)' }}>
                {['Tipo', 'Ordini', 'Diff.', 'Posizioni', 'Riferimenti', 'Scad. eff. ripristinate', 'Esito'].map(h => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {results.map(r => {
                const diff = r.orders != null && r.previous_orders != null ? r.orders - r.previous_orders : null;
                return (
                  <tr key={r.type} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ ...tdStyle, fontWeight: 700 }}>{r.label}</td>
                    <td style={numStyle}>{r.orders ?? '—'}</td>
                    <td style={{ ...numStyle, color: diff > 0 ? 'var(--green)' : diff < 0 ? 'var(--red)' : 'var(--text-tertiary)' }}>
                      {diff == null ? '—' : diff > 0 ? `+${diff}` : diff}
                    </td>
                    <td style={numStyle}>{r.materials ?? '—'}</td>
                    <td style={numStyle}>{r.refs ?? '—'}</td>
                    <td style={numStyle}>
                      {r.scadenze_restored != null ? `${r.scadenze_restored}/${r.scadenze_preserved ?? r.scadenze_restored}` : '—'}
                    </td>
                    <td style={{ ...tdStyle, color: r.error ? 'var(--red)' : r.skipped ? 'var(--amber)' : 'var(--green)' }}>
                      {r.error ? `Errore: ${r.error}` : r.skipped ? `Saltato — ${r.detail}` : 'OK'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {warnings.length > 0 && (
        <details style={{ marginTop: 12, fontSize: 11, color: 'var(--text-tertiary)' }}>
          <summary style={{ cursor: 'pointer' }}>{warnings.length} avvisi di analisi</summary>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18, maxHeight: 200, overflowY: 'auto' }}>
            {warnings.slice(0, 200).map((w, i) => <li key={i}>{w}</li>)}
            {warnings.length > 200 && <li>… e altri {warnings.length - 200}</li>}
          </ul>
        </details>
      )}
    </div>
  );
}

const thStyle = { textAlign: 'left', padding: '6px 10px', fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' };
const tdStyle = { padding: '6px 10px', color: 'var(--text-primary)' };
const numStyle = { ...tdStyle, fontFamily: 'var(--font-serif)', textAlign: 'right' };
