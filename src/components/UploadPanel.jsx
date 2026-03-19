import { useRef } from 'react';
import { useData } from '../hooks/useData';
import { MONTH_LABELS } from '../utils/parsers';

const S = {
  grid: { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 16 },
  card: { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '10px 14px', cursor: 'pointer', transition: 'border-color 0.15s' },
  cardDisabled: { opacity: 0.45, cursor: 'not-allowed' },
  label: { fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.7px', color: 'var(--text-secondary)', marginBottom: 3 },
  sub: { fontSize: 11, color: 'var(--text-tertiary)' },
  dot: { width: 6, height: 6, borderRadius: '50%', display: 'inline-block', marginRight: 5, verticalAlign: 'middle' },
  error: { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'var(--red-bg)', border: '1px solid var(--red-border)', borderRadius: 'var(--radius-md)', color: 'var(--red)', fontSize: 13, marginBottom: 12 },
  warning: { padding: '12px 14px', background: 'var(--amber-bg)', border: '1px solid var(--amber-border)', borderRadius: 'var(--radius-md)', fontSize: 13, marginBottom: 12 },
};

export default function UploadPanel({ canUpload }) {
  const { store, loading, error, uploadBudget, uploadAcquisito, uploadFatturato, uploadOrdiniAperti, newClientsLastUpload, setNewClientsLastUpload } = useData();
  const refs = { budget: useRef(), acq: useRef(), fat: useRef(), ord: useRef() };

  const handle = fn => async e => { const f = e.target.files[0]; if (f) await fn(f); e.target.value = ''; };

  const acqMonths = Object.keys(store.acquisito).map(Number).sort((a,b)=>a-b).map(m=>MONTH_LABELS[m]).join(', ');
  const fatMonths = Object.keys(store.fatturato).map(Number).sort((a,b)=>a-b).map(m=>MONTH_LABELS[m]).join(', ');

  const uploads = [
    { ref: refs.budget, fn: uploadBudget, label: 'Budget 2026', sub: store.budgetLoaded ? `${store.customers.length} clienti` : 'Carica una volta ad inizio anno', loaded: store.budgetLoaded, enabled: true },
    { ref: refs.acq,    fn: uploadAcquisito, label: 'Acquisito mensile', sub: acqMonths || 'Es: Acquisito_marzo_2026.xlsx', loaded: !!acqMonths, enabled: store.budgetLoaded },
    { ref: refs.fat,    fn: uploadFatturato, label: 'Fatturato mensile', sub: fatMonths || 'Es: Fatturato_marzo_2026.xlsx', loaded: !!fatMonths, enabled: store.budgetLoaded },
    { ref: refs.ord,    fn: uploadOrdiniAperti, label: 'Ordini aperti', sub: store.ordiniAperti?.fileDate || 'Dettaglio ordini del mese', loaded: !!store.ordiniAperti, enabled: true },
  ];

  return (
    <div>
      {error && <div style={S.error}><span style={{ fontSize: 16 }}>!</span> {error}</div>}

      {newClientsLastUpload.length > 0 && (
        <div style={S.warning}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontWeight: 600, color: 'var(--amber)' }}>★ {newClientsLastUpload.length} nuovi clienti rilevati e aggiunti</span>
            <button onClick={() => setNewClientsLastUpload([])} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', fontSize: 16, lineHeight: 1, padding: 0 }}>×</button>
          </div>
          {newClientsLastUpload.map(c => <div key={c} style={{ fontSize: 11, color: 'var(--amber)', marginTop: 2 }}>· {c}</div>)}
        </div>
      )}

      <div style={S.grid}>
        {uploads.map(u => (
          <div key={u.label}>
            <input ref={u.ref} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handle(u.fn)} />
            <div
              style={{ ...S.card, ...((!canUpload || !u.enabled) ? S.cardDisabled : {}) }}
              onClick={() => canUpload && u.enabled && u.ref.current?.click()}
            >
              <div style={S.label}>
                <span style={{ ...S.dot, background: u.loaded ? 'var(--green)' : 'var(--text-tertiary)' }} />
                {u.label}
              </div>
              <div style={S.sub}>{u.sub}</div>
            </div>
          </div>
        ))}
      </div>

      {loading && (
        <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-tertiary)', padding: '4px 0' }}>
          Caricamento...
        </div>
      )}
    </div>
  );
}
