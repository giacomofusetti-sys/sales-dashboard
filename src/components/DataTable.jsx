import { useState, useMemo } from 'react';
import { fmt, fmtDelta } from '../utils/analytics';
import { ChevronUp, ChevronDown, Star } from 'lucide-react';

const COLS = [
  { key: 'cliente',            label: 'Cliente',             align: 'left'  },
  { key: 'agente',             label: 'Agente',              align: 'left'  },
  { key: 'acquisito',          label: 'Acquisito',           align: 'right', fmt },
  { key: 'fatturato',          label: 'Fatturato',           align: 'right', fmt },
  { key: 'budgetVend',         label: 'Budget Vend.',        align: 'right', fmt },
  { key: 'budgetInt',          label: 'Budget Int.',         align: 'right', fmt },
  { key: 'scostAcqVsBudgetVend', label: 'Δ Acq/B.Vend',    align: 'right', delta: true },
  { key: 'scostFatVsBudgetVend', label: 'Δ Fat/B.Vend',    align: 'right', delta: true },
  { key: 'scostAcqVsBudgetInt',  label: 'Δ Acq/B.Int',     align: 'right', delta: true },
];

function Delta({ n }) {
  if (n == null || isNaN(n)) return <span style={{ color: 'var(--color-text-tertiary)' }}>—</span>;
  return <span style={{ color: n >= 0 ? 'var(--color-text-success)' : 'var(--color-text-danger)', fontWeight: 500 }}>{fmtDelta(n)}</span>;
}

export default function DataTable({ rows, agentFilter, showNewOnly }) {
  const [sortKey, setSortKey] = useState('acquisito');
  const [sortDir, setSortDir] = useState(-1);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    let r = rows || [];
    if (agentFilter) r = r.filter(x => x.agente === agentFilter);
    if (showNewOnly) r = r.filter(x => x.isNew);
    if (search) {
      const q = search.toLowerCase();
      r = r.filter(x => x.cliente?.toLowerCase().includes(q) || x.agente?.toLowerCase().includes(q));
    }
    return [...r].sort((a, b) => {
      const av = a[sortKey] ?? ''; const bv = b[sortKey] ?? '';
      return typeof av === 'string' ? sortDir * av.localeCompare(bv) : sortDir * (av - bv);
    });
  }, [rows, agentFilter, showNewOnly, search, sortKey, sortDir]);

  const sort = (key) => { if (sortKey === key) setSortDir(d => d * -1); else { setSortKey(key); setSortDir(-1); } };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
        <input type="text" placeholder="Cerca cliente o agente..." value={search} onChange={e => setSearch(e.target.value)}
          style={{ fontSize: 13, padding: '6px 10px', borderRadius: 6, border: '0.5px solid var(--color-border-secondary)', background: 'var(--color-background-primary)', color: 'var(--color-text-primary)', width: 260 }} />
        <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{filtered.length} righe</span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '0.5px solid var(--color-border-secondary)' }}>
              {COLS.map(col => (
                <th key={col.key} onClick={() => sort(col.key)}
                  style={{ textAlign: col.align, padding: '8px 10px', fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap', color: 'var(--color-text-secondary)', userSelect: 'none' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                    {col.label}
                    {sortKey === col.key ? (sortDir === -1 ? <ChevronDown size={11}/> : <ChevronUp size={11}/>) : <span style={{ opacity: 0.2, fontSize: 9 }}>↕</span>}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={COLS.length} style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-tertiary)', fontSize: 13 }}>Nessun dato</td></tr>
            )}
            {filtered.map((row, i) => (
              <tr key={row.clienteCap + i} style={{
                borderBottom: '0.5px solid var(--color-border-tertiary)',
                background: row.isNew ? 'var(--color-background-warning)' : (i % 2 === 0 ? 'transparent' : 'var(--color-background-secondary)'),
              }}>
                {COLS.map(col => (
                  <td key={col.key} style={{ padding: '7px 10px', textAlign: col.align, whiteSpace: col.key === 'cliente' ? 'normal' : 'nowrap' }}>
                    {col.key === 'cliente' ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        {row.isNew && <Star size={11} color="var(--color-text-warning)" fill="var(--color-text-warning)" style={{ flexShrink: 0 }} />}
                        {row.cliente}
                      </span>
                    ) : col.delta ? <Delta n={row[col.key]} />
                      : col.fmt ? col.fmt(row[col.key])
                      : (row[col.key] ?? '—')}
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
