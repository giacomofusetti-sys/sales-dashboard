import { useState, useMemo } from 'react';
import { fmt, fmtDelta, fmtPct } from '../utils/analytics';

const COLS = [
  { key: 'cliente',              label: 'Cliente',          align: 'left'  },
  { key: 'agente',               label: 'Agente',           align: 'left'  },
  { key: 'acquisito',            label: 'Acquisito',        align: 'right', fmt },
  { key: 'fatturato',            label: 'Fatturato',        align: 'right', fmt },
  { key: 'budgetVend',           label: 'Bdg Vend.',        align: 'right', fmt },
  { key: 'budgetInt',            label: 'Bdg Int.',         align: 'right', fmt },
  { key: 'scostAcqVsBudgetVend', label: 'Δ Acq/BV',        align: 'right', delta: true },
  { key: 'pctAcqVsBudgetVend',   label: '% Acq/BV',        align: 'right', pct: true },
  { key: 'scostFatVsBudgetVend', label: 'Δ Fat/BV',        align: 'right', delta: true },
  { key: 'pctFatVsBudgetVend',   label: '% Fat/BV',        align: 'right', pct: true },
  { key: 'scostAcqVsBudgetInt',  label: 'Δ Acq/BI',        align: 'right', delta: true },
  { key: 'pctAcqVsBudgetInt',    label: '% Acq/BI',        align: 'right', pct: true },
  { key: 'scostFatVsBudgetInt',  label: 'Δ Fat/BI',        align: 'right', delta: true },
  { key: 'pctFatVsBudgetInt',    label: '% Fat/BI',        align: 'right', pct: true },
  { key: 'previsioneAnno',       label: 'Prev. Anno',       align: 'right', fmt },
  { key: 'pctPrevVsBudgetVendAnn', label: '% Prev/BV Ann.', align: 'right', pct: true },
];

function Delta({ n }) {
  if (n == null || isNaN(n)) return <span style={{ color: 'var(--text-tertiary)' }}>—</span>;
  return <span style={{ color: n >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>{fmtDelta(n)}</span>;
}

function Pct({ n }) {
  if (n == null || isNaN(n) || !isFinite(n)) return <span style={{ color: 'var(--text-tertiary)' }}>—</span>;
  return <span style={{ color: n >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 600, fontSize: 11 }}>{fmtPct(n)}</span>;
}

function Th({ col, sortKey, sortDir, onSort }) {
  const active = sortKey === col.key;
  return (
    <th onClick={() => onSort(col.key)} style={{ textAlign: col.align, padding: '8px 12px', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.7px', color: active ? 'var(--text-primary)' : 'var(--text-tertiary)', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)', background: 'var(--bg-subtle)' }}>
      {col.label} {active ? (sortDir === -1 ? '↓' : '↑') : ''}
    </th>
  );
}

export default function DataTable({ rows, agentFilter, showNewOnly }) {
  const [sortKey, setSortKey] = useState('acquisito');
  const [sortDir, setSortDir] = useState(-1);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    let r = rows || [];
    if (agentFilter) r = r.filter(x => x.agente === agentFilter);
    if (showNewOnly) r = r.filter(x => x.isNew);
    if (search) { const q = search.toLowerCase(); r = r.filter(x => x.cliente?.toLowerCase().includes(q) || x.agente?.toLowerCase().includes(q)); }
    return [...r].sort((a, b) => {
      const av = a[sortKey] ?? ''; const bv = b[sortKey] ?? '';
      return typeof av === 'string' ? sortDir * av.localeCompare(bv) : sortDir * (av - bv);
    });
  }, [rows, agentFilter, showNewOnly, search, sortKey, sortDir]);

  const onSort = key => { if (sortKey === key) setSortDir(d => d*-1); else { setSortKey(key); setSortDir(-1); } };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <input type="text" placeholder="Cerca cliente o agente..." value={search} onChange={e => setSearch(e.target.value)}
          style={{ fontSize: 13, padding: '7px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', width: 280, outline: 'none' }} />
        <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{filtered.length} righe</span>
      </div>
      <div style={{ overflowX: 'auto', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr>{COLS.map(col => <Th key={col.key} col={col} sortKey={sortKey} sortDir={sortDir} onSort={onSort} />)}</tr></thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={COLS.length} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-tertiary)', fontSize: 13 }}>Nessun dato</td></tr>
            )}
            {filtered.map((row, i) => (
              <tr key={row.clienteCap + i} style={{ background: row.isNew ? 'var(--amber-bg)' : (i%2===0 ? 'var(--bg-card)' : 'var(--bg-subtle)'), borderBottom: '1px solid var(--border)' }}>
                {COLS.map(col => (
                  <td key={col.key} style={{ padding: '8px 12px', textAlign: col.align, whiteSpace: col.key === 'cliente' ? 'normal' : 'nowrap' }}>
                    {col.key === 'cliente' ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        {row.isNew && <span style={{ fontSize: 9, background: 'var(--amber-bg)', color: 'var(--amber)', border: '1px solid var(--amber-border)', borderRadius: 3, padding: '1px 5px', fontWeight: 600, flexShrink: 0 }}>NUOVO</span>}
                        <span style={{ fontWeight: row.isNew ? 600 : 400 }}>{row.cliente}</span>
                      </span>
                    ) : col.pct ? <Pct n={row[col.key]} />
                      : col.delta ? <Delta n={row[col.key]} />
                      : col.fmt ? <span className="num" style={{ fontSize: 13 }}>{col.fmt(row[col.key])}</span>
                      : <span style={{ color: 'var(--text-secondary)' }}>{row[col.key] ?? '—'}</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
