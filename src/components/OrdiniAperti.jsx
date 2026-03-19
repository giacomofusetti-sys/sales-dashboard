import { useState, useMemo } from 'react';
import { fmt } from '../utils/analytics';
import { ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react';

function ClientRow({ entry }) {
  const [open, setOpen] = useState(false);
  const inRitardo = entry.righe.filter(r => r.ggRitardo !== '-' && parseInt(r.ggRitardo) > 0).length;

  return (
    <>
      <tr onClick={() => setOpen(o => !o)} style={{ cursor: 'pointer', borderBottom: '0.5px solid var(--color-border-secondary)', background: 'var(--color-background-secondary)' }}>
        <td style={{ padding: '9px 10px', fontWeight: 500 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {open ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}
            {entry.cliente}
          </span>
        </td>
        <td style={{ padding: '9px 10px', textAlign: 'left', fontSize: 13, color: 'var(--color-text-secondary)' }}>{entry.agente || '—'}</td>
        <td style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 500 }}>{fmt(entry.totaleAperti)}</td>
        <td style={{ padding: '9px 10px', textAlign: 'center' }}>
          {inRitardo > 0
            ? <span style={{ display:'inline-flex', alignItems:'center', gap:4, color:'var(--color-text-danger)', fontSize:12, fontWeight:500 }}>
                <AlertTriangle size={12}/> {inRitardo} ({entry.maxRitardo}gg)
              </span>
            : <span style={{ color:'var(--color-text-tertiary)', fontSize:12 }}>—</span>}
        </td>
        <td style={{ padding: '9px 10px', textAlign: 'center', fontSize: 12, color: 'var(--color-text-secondary)' }}>{entry.righe.length}</td>
      </tr>
      {open && entry.righe.map((r, i) => {
        const ritardo = parseInt(r.ggRitardo) || 0;
        return (
          <tr key={i} style={{ borderBottom: '0.5px solid var(--color-border-tertiary)', background: ritardo > 0 ? 'var(--color-background-danger)' : (i % 2 === 0 ? 'transparent' : 'var(--color-background-secondary)') }}>
            <td style={{ padding: '5px 10px 5px 34px', fontSize: 11, color: 'var(--color-text-secondary)' }} colSpan={2}>{r.articolo}</td>
            <td style={{ padding: '5px 10px', textAlign: 'right', fontSize: 12 }}>{fmt(r.valoreAperti)}</td>
            <td style={{ padding: '5px 10px', textAlign: 'center', fontSize: 12, color: ritardo > 0 ? 'var(--color-text-danger)' : 'var(--color-text-tertiary)' }}>
              {ritardo > 0 ? `${r.ggRitardo}gg` : r.dataConsegna}
            </td>
            <td style={{ padding: '5px 10px', textAlign: 'center', fontSize: 11, color: 'var(--color-text-secondary)' }}>{r.rifDoc}</td>
          </tr>
        );
      })}
    </>
  );
}

export default function OrdiniAperti({ enrichedRows, fileDate }) {
  const [filter, setFilter] = useState('all'); // all | ritardo
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    let r = enrichedRows || [];
    if (filter === 'ritardo') r = r.filter(x => x.hasRitardo);
    if (search) r = r.filter(x => x.cliente.toLowerCase().includes(search.toLowerCase()) || x.agente?.toLowerCase().includes(search.toLowerCase()));
    return r;
  }, [enrichedRows, filter, search]);

  const totale = (enrichedRows || []).reduce((s, r) => s + r.totaleAperti, 0);
  const inRitardo = (enrichedRows || []).filter(r => r.hasRitardo).length;
  const totRitardo = (enrichedRows || []).filter(r => r.hasRitardo).reduce((s, r) => s + r.totaleAperti, 0);

  if (!enrichedRows?.length) return (
    <div style={{ textAlign: 'center', color: 'var(--color-text-tertiary)', padding: '2rem', fontSize: 13 }}>
      Nessun dato — carica il file Ordini Aperti
    </div>
  );

  return (
    <div>
      {fileDate && <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginBottom: 12 }}>Estrazione del {fileDate}</div>}

      {/* Summary KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 16 }}>
        {[
          { label: 'Backlog totale', value: fmt(totale) },
          { label: 'Clienti con ordini', value: enrichedRows.length },
          { label: 'Clienti in ritardo', value: inRitardo, danger: inRitardo > 0 },
          { label: 'Valore in ritardo', value: fmt(totRitardo), danger: totRitardo > 0 },
        ].map(k => (
          <div key={k.label} style={{ background: 'var(--color-background-secondary)', borderRadius: 8, padding: '0.875rem 1rem' }}>
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 4 }}>{k.label}</div>
            <div style={{ fontSize: 20, fontWeight: 500, color: k.danger ? 'var(--color-text-danger)' : undefined }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <input type="text" placeholder="Cerca cliente..." value={search} onChange={e => setSearch(e.target.value)}
          style={{ fontSize: 13, padding: '6px 10px', borderRadius: 6, border: '0.5px solid var(--color-border-secondary)', background: 'var(--color-background-primary)', color: 'var(--color-text-primary)', width: 220 }} />
        {['all', 'ritardo'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            style={{ fontSize: 13, padding: '5px 14px', borderRadius: 20, border: '0.5px solid', cursor: 'pointer',
              background: filter === f ? 'var(--color-background-info)' : 'transparent',
              borderColor: filter === f ? 'var(--color-border-info)' : 'var(--color-border-secondary)',
              color: filter === f ? 'var(--color-text-info)' : 'var(--color-text-primary)' }}>
            {f === 'all' ? 'Tutti' : 'Solo in ritardo'}
          </button>
        ))}
        <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{filtered.length} clienti</span>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ borderBottom: '0.5px solid var(--color-border-secondary)' }}>
              {['Cliente', 'Agente', 'Valore Aperto', 'Ritardo', 'N. righe'].map((h, i) => (
                <th key={h} style={{ padding: '8px 10px', textAlign: i >= 2 ? 'center' : 'left', fontWeight: 500, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>{filtered.map(e => <ClientRow key={e.cliente} entry={e}/>)}</tbody>
        </table>
      </div>
    </div>
  );
}
