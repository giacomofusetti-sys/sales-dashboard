import { useState, useMemo } from 'react';
import { fmt } from '../utils/analytics';

function Delta({ n }) {
  if (n == null) return <span style={{ color: 'var(--text-tertiary)' }}>—</span>;
  return <span style={{ color: n >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>{n > 0 ? '+' : ''}{n}</span>;
}

function ClientRow({ entry }) {
  const [open, setOpen] = useState(false);
  const inRitardo = entry.righe.filter(r => parseInt(r.ggRitardo) > 0).length;

  return (
    <>
      <tr onClick={() => setOpen(o=>!o)} style={{ cursor: 'pointer', background: 'var(--bg-subtle)', borderBottom: '1px solid var(--border)' }}>
        <td style={{ padding: '10px 12px', fontWeight: 600 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{open ? '▼' : '▶'}</span>
            {entry.cliente}
          </span>
        </td>
        <td style={{ padding: '10px 12px', color: 'var(--text-secondary)', fontSize: 13 }}>{entry.agente || '—'}</td>
        <td style={{ padding: '10px 12px', textAlign: 'right' }}><span className="num">{fmt(entry.totaleAperti)}</span></td>
        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
          {inRitardo > 0
            ? <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--red)', background: 'var(--red-bg)', border: '1px solid var(--red-border)', borderRadius: 3, padding: '2px 7px' }}>
                {inRitardo} riga{inRitardo>1?'e':''} · max {entry.maxRitardo}gg
              </span>
            : <span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>—</span>}
        </td>
        <td style={{ padding: '10px 12px', textAlign: 'center', fontSize: 12, color: 'var(--text-tertiary)' }}>{entry.righe.length}</td>
      </tr>
      {open && entry.righe.map((r, i) => {
        const ritardo = parseInt(r.ggRitardo) || 0;
        return (
          <tr key={i} style={{ background: ritardo > 0 ? 'var(--red-bg)' : (i%2===0 ? 'var(--bg-card)' : 'var(--bg-subtle)'), borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '6px 12px 6px 36px', fontSize: 11, color: 'var(--text-secondary)' }} colSpan={2}>{r.articolo}</td>
            <td style={{ padding: '6px 12px', textAlign: 'right', fontSize: 12 }}><span className="num">{fmt(r.valoreAperti)}</span></td>
            <td style={{ padding: '6px 12px', textAlign: 'center', fontSize: 12, color: ritardo > 0 ? 'var(--red)' : 'var(--text-tertiary)', fontWeight: ritardo > 0 ? 600 : 400 }}>
              {ritardo > 0 ? `${r.ggRitardo}gg ritardo` : r.dataConsegna}
            </td>
            <td style={{ padding: '6px 12px', textAlign: 'center', fontSize: 11, color: 'var(--text-tertiary)' }}>{r.rifDoc}</td>
          </tr>
        );
      })}
    </>
  );
}

export default function OrdiniAperti({ enrichedRows, fileDate }) {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    let r = enrichedRows || [];
    if (filter === 'ritardo') r = r.filter(x => x.hasRitardo);
    if (search) r = r.filter(x => x.cliente.toLowerCase().includes(search.toLowerCase()) || x.agente?.toLowerCase().includes(search.toLowerCase()));
    return r;
  }, [enrichedRows, filter, search]);

  const totale = (enrichedRows||[]).reduce((s,r)=>s+r.totaleAperti, 0);
  const inRitardo = (enrichedRows||[]).filter(r=>r.hasRitardo).length;
  const totRitardo = (enrichedRows||[]).filter(r=>r.hasRitardo).reduce((s,r)=>s+r.totaleAperti, 0);

  if (!enrichedRows?.length) return (
    <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: '3rem', fontSize: 13 }}>
      Nessun dato — carica il file Ordini Aperti
    </div>
  );

  return (
    <div>
      {fileDate && <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 14 }}>Estrazione del {fileDate}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px,1fr))', gap: 10, marginBottom: 18 }}>
        {[
          { label: 'Backlog totale',      value: fmt(totale),    danger: false },
          { label: 'Clienti con ordini',  value: enrichedRows.length, danger: false },
          { label: 'Clienti in ritardo',  value: inRitardo,      danger: inRitardo > 0 },
          { label: 'Valore in ritardo',   value: fmt(totRitardo), danger: totRitardo > 0 },
        ].map(k => (
          <div key={k.label} style={{ background: 'var(--bg-card)', border: `1px solid ${k.danger ? 'var(--red-border)' : 'var(--border)'}`, borderRadius: 'var(--radius-md)', padding: '14px 16px' }}>
            <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.7px', color: 'var(--text-tertiary)', marginBottom: 6 }}>{k.label}</div>
            <div className="num" style={{ fontSize: 20, color: k.danger ? 'var(--red)' : 'var(--text-primary)' }}>{k.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <input type="text" placeholder="Cerca cliente..." value={search} onChange={e=>setSearch(e.target.value)}
          style={{ fontSize: 13, padding: '7px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', width: 220, outline: 'none' }} />
        {['all','ritardo'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            style={{ fontSize: 12, padding: '5px 14px', borderRadius: 20, border: '1px solid', cursor: 'pointer',
              background: filter===f ? 'var(--accent)' : 'var(--bg-card)',
              borderColor: filter===f ? 'var(--accent)' : 'var(--border)',
              color: filter===f ? '#fff' : 'var(--text-secondary)' }}>
            {f==='all' ? 'Tutti' : 'Solo in ritardo'}
          </button>
        ))}
        <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{filtered.length} clienti</span>
      </div>

      <div style={{ overflowX: 'auto', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ background: 'var(--bg-subtle)', borderBottom: '1px solid var(--border)' }}>
              {['Cliente','Agente','Valore aperto','Ritardo','N. righe'].map((h,i) => (
                <th key={h} style={{ padding: '8px 12px', textAlign: i>=2?'center':'left', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.7px', color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>{filtered.map(e => <ClientRow key={e.cliente} entry={e}/>)}</tbody>
        </table>
      </div>
    </div>
  );
}
