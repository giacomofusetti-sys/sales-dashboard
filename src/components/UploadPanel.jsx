import { useRef } from 'react';
import { useData } from '../hooks/useData';
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle, X } from 'lucide-react';
import { MONTH_LABELS } from '../utils/parsers';

function UploadCard({ title, subtitle, icon: Icon, iconBg, iconColor, loaded, loadedLabel, onClick, disabled }) {
  return (
    <div
      onClick={disabled ? undefined : onClick}
      style={{
        border: '0.5px solid var(--color-border-tertiary)', borderRadius: 12,
        padding: '1rem 1.25rem', background: 'var(--color-background-primary)',
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
        transition: 'border-color 0.15s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ width: 34, height: 34, borderRadius: 8, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon size={16} color={iconColor} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontWeight: 500, fontSize: 13 }}>{title}</span>
            {loaded && <CheckCircle size={13} color="var(--color-text-success)" />}
          </div>
          <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 2 }}>
            {loaded ? loadedLabel : subtitle}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function UploadPanel() {
  const { store, loading, error, uploadBudget, uploadAcquisito, uploadFatturato, uploadOrdiniAperti, resetAll, newClientsLastUpload, setNewClientsLastUpload } = useData();
  const refs = { budget: useRef(), acq: useRef(), fat: useRef(), ord: useRef() };

  const handle = (fn) => async (e) => {
    const file = e.target.files[0];
    if (file) await fn(file);
    e.target.value = '';
  };

  const acqMonths = Object.keys(store.acquisito).map(Number).sort((a,b)=>a-b).map(m => MONTH_LABELS[m]).join(', ');
  const fatMonths = Object.keys(store.fatturato).map(Number).sort((a,b)=>a-b).map(m => MONTH_LABELS[m]).join(', ');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>

      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'var(--color-background-danger)', borderRadius: 8, color: 'var(--color-text-danger)', fontSize: 13 }}>
          <AlertCircle size={14} style={{ flexShrink: 0 }} /> {error}
        </div>
      )}

      {newClientsLastUpload.length > 0 && (
        <div style={{ padding: '12px 14px', background: 'var(--color-background-warning)', borderRadius: 8, fontSize: 13 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontWeight: 500, color: 'var(--color-text-warning)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <AlertCircle size={13} /> {newClientsLastUpload.length} nuovi clienti aggiunti
            </span>
            <button onClick={() => setNewClientsLastUpload([])} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-warning)', padding: 0 }}>
              <X size={14} />
            </button>
          </div>
          <div style={{ color: 'var(--color-text-warning)', lineHeight: 1.8 }}>
            {newClientsLastUpload.map(c => <span key={c} style={{ display: 'block', fontSize: 12 }}>★ {c}</span>)}
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
        <input ref={refs.budget} type="file" accept=".xlsx,.xls" style={{ display:'none' }} onChange={handle(uploadBudget)} />
        <UploadCard title="Budget 2026" subtitle="Carica una volta ad inizio anno" icon={FileSpreadsheet}
          iconBg="var(--color-background-info)" iconColor="var(--color-text-info)"
          loaded={store.budgetLoaded} loadedLabel={`${store.customers.length} clienti`}
          onClick={() => refs.budget.current?.click()} />

        <input ref={refs.acq} type="file" accept=".xlsx,.xls" style={{ display:'none' }} onChange={handle(uploadAcquisito)} />
        <UploadCard title="Acquisito mensile" subtitle={store.budgetLoaded ? "Es: Acquisito_marzo_2026.xlsx" : "Prima carica il budget"} icon={Upload}
          iconBg="var(--color-background-success)" iconColor="var(--color-text-success)"
          loaded={acqMonths.length > 0} loadedLabel={acqMonths}
          onClick={() => refs.acq.current?.click()} disabled={!store.budgetLoaded} />

        <input ref={refs.fat} type="file" accept=".xlsx,.xls" style={{ display:'none' }} onChange={handle(uploadFatturato)} />
        <UploadCard title="Fatturato mensile" subtitle={store.budgetLoaded ? "Es: Fatturato_marzo_2026.xlsx" : "Prima carica il budget"} icon={Upload}
          iconBg="var(--color-background-success)" iconColor="var(--color-text-success)"
          loaded={fatMonths.length > 0} loadedLabel={fatMonths}
          onClick={() => refs.fat.current?.click()} disabled={!store.budgetLoaded} />

        <input ref={refs.ord} type="file" accept=".xlsx,.xls" style={{ display:'none' }} onChange={handle(uploadOrdiniAperti)} />
        <UploadCard title="Ordini aperti" subtitle="Dettaglio ordini del mese" icon={FileSpreadsheet}
          iconBg="var(--color-background-warning)" iconColor="var(--color-text-warning)"
          loaded={!!store.ordiniAperti} loadedLabel={store.ordiniAperti?.fileDate || 'Caricato'}
          onClick={() => refs.ord.current?.click()} />
      </div>

      {loading && <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--color-text-secondary)', padding: '6px 0' }}>Elaborazione...</div>}

      {(store.budgetLoaded || Object.keys(store.acquisito).length > 0) && !loading && (
        <div style={{ textAlign: 'right' }}>
          <button onClick={resetAll} style={{ fontSize: 12, color: 'var(--color-text-danger)', background: 'none', border: 'none', cursor: 'pointer' }}>
            Reset tutti i dati
          </button>
        </div>
      )}
    </div>
  );
}
