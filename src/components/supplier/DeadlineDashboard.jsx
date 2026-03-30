import { useMemo, useState } from 'react';
import { useSupplierData } from '../../hooks/useSupplierData';

const RANGES = [
  { key: 'scaduti', label: 'Scaduti', days: 0, color: 'var(--red)', bg: 'var(--red-bg)', border: 'var(--red-border)' },
  { key: '7g', label: 'Entro 7 giorni', days: 7, color: 'var(--red)', bg: 'var(--red-bg)', border: 'var(--red-border)' },
  { key: '14g', label: 'Entro 14 giorni', days: 14, color: 'var(--amber)', bg: 'var(--amber-bg)', border: 'var(--amber-border)' },
  { key: '30g', label: 'Entro 30 giorni', days: 30, color: 'var(--green)', bg: 'var(--green-bg)', border: 'var(--green-border)' },
];

export default function DeadlineDashboard() {
  const { deadlines, loading } = useSupplierData();
  const [expandedRange, setExpandedRange] = useState('7g');

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const grouped = useMemo(() => {
    const result = { scaduti: [], '7g': [], '14g': [], '30g': [] };
    for (const d of deadlines) {
      const dateStr = d.scadenza_effettiva || d.scadenza;
      if (!dateStr) continue;
      const date = new Date(dateStr);
      const diff = Math.ceil((date - today) / 86400000);

      if (diff < 0) result.scaduti.push(d);
      else if (diff <= 7) result['7g'].push(d);
      else if (diff <= 14) result['14g'].push(d);
      else result['30g'].push(d);
    }
    return result;
  }, [deadlines, today.getTime()]);

  if (loading) {
    return <div style={{ padding: '3rem 0', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>Caricamento scadenze...</div>;
  }

  const totalCount = deadlines.length;

  return (
    <div>
      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
        {RANGES.map(r => {
          const count = grouped[r.key].length;
          const isActive = expandedRange === r.key;
          return (
            <button key={r.key} onClick={() => setExpandedRange(r.key)}
              style={{
                background: isActive ? r.bg : 'var(--bg-card)',
                border: `1px solid ${isActive ? r.border : 'var(--border)'}`,
                borderRadius: 'var(--radius-md)', padding: '14px 16px',
                cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
              }}>
              <div style={{ fontSize: 11, color: r.color, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>{r.label}</div>
              <div style={{ fontFamily: 'var(--font-serif)', fontSize: 28, fontWeight: 700, color: 'var(--text-primary)' }}>{count}</div>
            </button>
          );
        })}
      </div>

      {totalCount === 0 && (
        <div style={{ textAlign: 'center', padding: '2rem 0', color: 'var(--text-tertiary)', fontSize: 13 }}>
          Nessuna scadenza nei prossimi 30 giorni.
        </div>
      )}

      {/* Detail table */}
      {expandedRange && grouped[expandedRange].length > 0 && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--bg-subtle)', borderBottom: '1px solid var(--border)' }}>
                <th style={thStyle}>Tipo</th>
                <th style={thStyle}>Ordine</th>
                <th style={thStyle}>Fornitore/Cliente</th>
                <th style={thStyle}>Prodotto</th>
                <th style={thStyle}>Scadenza</th>
                <th style={thStyle}>Descrizione</th>
              </tr>
            </thead>
            <tbody>
              {grouped[expandedRange].map((d, i) => {
                const dateStr = d.scadenza_effettiva || d.scadenza;
                const orderInfo = d.supplier_orders || {};
                return (
                  <tr key={d.id || i} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={tdStyle}>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 6px', borderRadius: 3, background: 'var(--bg-subtle)', border: '1px solid var(--border)' }}>
                        {orderInfo.order_type}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, fontFamily: 'var(--font-serif)', fontWeight: 600 }}>{orderInfo.order_ref}</td>
                    <td style={tdStyle}>{orderInfo.supplier_name || orderInfo.client_name || '—'}</td>
                    <td style={{ ...tdStyle, fontFamily: 'var(--font-serif)' }}>{d.codice_prodotto || '—'}</td>
                    <td style={{ ...tdStyle, fontFamily: 'var(--font-serif)', fontWeight: 600 }}>
                      {dateStr ? new Date(dateStr).toLocaleDateString('it-IT') : '—'}
                    </td>
                    <td style={tdStyle}>{d.descrizione || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const thStyle = { textAlign: 'left', padding: '8px 12px', fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px' };
const tdStyle = { padding: '8px 12px', color: 'var(--text-primary)' };
