import { useEffect, useMemo, useState, useCallback } from 'react';
import { useSupplierData } from '../../hooks/useSupplierData';

function dateStr(d) { return d.toISOString().split('T')[0]; }

const RANGES = [
  { key: 'scaduti', label: 'Scaduti' },
  { key: 'oggi',    label: 'Oggi' },
  { key: '7g',      label: 'Prossimi 7g' },
  { key: '14g',     label: 'Prossimi 14g' },
  { key: '30g',     label: 'Prossimi 30g' },
];

const RANGE_COLORS = {
  scaduti: { color: 'var(--red)',   bg: 'var(--red-bg)',   border: 'var(--red-border)' },
  oggi:    { color: 'var(--red)',   bg: 'var(--red-bg)',   border: 'var(--red-border)' },
  '7g':    { color: 'var(--amber)', bg: 'var(--amber-bg)', border: 'var(--amber-border)' },
  '14g':   { color: 'var(--amber)', bg: 'var(--amber-bg)', border: 'var(--amber-border)' },
  '30g':   { color: 'var(--green)', bg: 'var(--green-bg)', border: 'var(--green-border)' },
};

function rangeDates(key) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = dateStr(today);

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = dateStr(tomorrow);

  const d7 = new Date(today); d7.setDate(d7.getDate() + 7);
  const d14 = new Date(today); d14.setDate(d14.getDate() + 14);
  const d30 = new Date(today); d30.setDate(d30.getDate() + 30);

  switch (key) {
    case 'scaduti': return { from: null, to: dateStr(new Date(today.getTime() - 86400000)) }; // < today
    case 'oggi':    return { from: todayStr, to: todayStr };
    case '7g':      return { from: tomorrowStr, to: dateStr(d7) };
    case '14g':     return { from: dateStr(d7), to: dateStr(d14) };
    case '30g':     return { from: dateStr(d14), to: dateStr(d30) };
    default:        return { from: null, to: null };
  }
}

const DOC_TYPES = ['OV', 'OA', 'OP', 'OL', 'ACCIAIERIA'];

export default function DeadlineDashboard({ onNavigateToOrder }) {
  const { countDeadlines, loadDeadlineRows, loading } = useSupplierData();
  const [counts, setCounts] = useState({});
  const [activeRange, setActiveRange] = useState('scaduti');
  const [rows, setRows] = useState([]);
  const [loadingRows, setLoadingRows] = useState(false);
  const [groupBySupplier, setGroupBySupplier] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [activeDocTypes, setActiveDocTypes] = useState(new Set());

  // Load counts for all ranges
  useEffect(() => {
    if (loading) return;
    let cancelled = false;
    (async () => {
      const c = {};
      for (const r of RANGES) {
        try {
          const { from, to } = rangeDates(r.key);
          c[r.key] = await countDeadlines(from, to);
        } catch (err) {
          console.error(`[Deadlines] count error for ${r.key}:`, err);
          c[r.key] = '?';
        }
      }
      if (!cancelled) setCounts(c);
    })();
    return () => { cancelled = true; };
  }, [loading, countDeadlines]);

  // Load detail rows when active range changes
  useEffect(() => {
    if (loading || !activeRange) return;
    let cancelled = false;
    setLoadingRows(true);
    (async () => {
      try {
        const { from, to } = rangeDates(activeRange);
        const data = await loadDeadlineRows(from, to);
        if (!cancelled) setRows(data);
      } catch (err) {
        console.error(`[Deadlines] load rows error:`, err);
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoadingRows(false);
      }
    })();
    return () => { cancelled = true; };
  }, [loading, activeRange, loadDeadlineRows]);

  const toggleDocType = useCallback((type) => {
    setActiveDocTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }, []);

  // Filter rows by search text and doc type
  const filteredRows = useMemo(() => {
    let result = rows;
    if (searchText.trim()) {
      const q = searchText.toLowerCase();
      result = result.filter(d => {
        const info = d.supplier_orders || {};
        return (info.supplier_name || '').toLowerCase().includes(q)
          || (info.client_name || '').toLowerCase().includes(q)
          || (info.order_ref || '').toLowerCase().includes(q)
          || (d.codice_prodotto || '').toLowerCase().includes(q)
          || (d.descrizione || '').toLowerCase().includes(q);
      });
    }
    if (activeDocTypes.size > 0) {
      result = result.filter(d => {
        const info = d.supplier_orders || {};
        return activeDocTypes.has(info.order_type);
      });
    }
    return result;
  }, [rows, searchText, activeDocTypes]);

  // Group rows by supplier
  const grouped = useMemo(() => {
    if (!groupBySupplier) return null;
    const map = {};
    for (const d of filteredRows) {
      const info = d.supplier_orders || {};
      const name = info.supplier_name || info.client_name || 'Sconosciuto';
      if (!map[name]) map[name] = { items: [], types: new Set() };
      map[name].items.push(d);
      if (info.order_type) map[name].types.add(info.order_type);
    }
    return Object.entries(map)
      .map(([name, g]) => ({ name, items: g.items, types: [...g.types] }))
      .sort((a, b) => b.items.length - a.items.length);
  }, [filteredRows, groupBySupplier]);

  if (loading) {
    return <div style={{ padding: '3rem 0', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>Caricamento scadenze...</div>;
  }

  const colors = RANGE_COLORS[activeRange] || RANGE_COLORS.scaduti;

  return (
    <div>
      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 16 }}>
        {RANGES.map(r => {
          const c = RANGE_COLORS[r.key];
          const isActive = activeRange === r.key;
          const count = counts[r.key];
          return (
            <button key={r.key} onClick={() => setActiveRange(r.key)}
              style={{
                background: isActive ? c.bg : 'var(--bg-card)',
                border: `1px solid ${isActive ? c.border : 'var(--border)'}`,
                borderRadius: 'var(--radius-md)', padding: '12px 14px',
                cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
              }}>
              <div style={{ fontSize: 10, color: c.color, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>{r.label}</div>
              <div style={{ fontFamily: 'var(--font-serif)', fontSize: 26, fontWeight: 700, color: 'var(--text-primary)' }}>
                {count === undefined ? '...' : count}
              </div>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <input
          type="text"
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
          placeholder="Cerca fornitore / cliente..."
          style={{ fontSize: 12, padding: '6px 10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', background: 'var(--bg-subtle)', color: 'var(--text-primary)', outline: 'none', minWidth: 200, maxWidth: 320 }}
        />
        <div style={{ display: 'flex', gap: 4 }}>
          {DOC_TYPES.map(t => {
            const active = activeDocTypes.has(t);
            return (
              <button key={t} onClick={() => toggleDocType(t)}
                style={{
                  fontSize: 10, fontWeight: 600, padding: '4px 8px', borderRadius: 'var(--radius-sm)',
                  border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                  background: active ? 'var(--accent)' : 'var(--bg-card)',
                  color: active ? '#fff' : 'var(--text-secondary)',
                  cursor: 'pointer', transition: 'all 0.15s',
                }}>
                {t}
              </button>
            );
          })}
        </div>
      </div>

      {/* View toggle */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
          {loadingRows ? 'Caricamento...' : `${filteredRows.length} materiali`}{filteredRows.length !== rows.length && ` (filtrati da ${rows.length})`}{rows.length >= 500 && ' (max 500)'}
        </div>
        <button onClick={() => setGroupBySupplier(p => !p)}
          style={{ fontSize: 11, padding: '4px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: groupBySupplier ? 'var(--bg-subtle)' : 'var(--bg-card)', color: 'var(--text-secondary)', cursor: 'pointer' }}>
          {groupBySupplier ? 'Per fornitore' : 'Lista'}
        </button>
      </div>

      {filteredRows.length === 0 && !loadingRows && (
        <div style={{ textAlign: 'center', padding: '2rem 0', color: 'var(--text-tertiary)', fontSize: 13 }}>
          {rows.length === 0 ? 'Nessun materiale in questo range.' : 'Nessun risultato con i filtri correnti.'}
        </div>
      )}

      {/* Grouped by supplier */}
      {groupBySupplier && grouped && grouped.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {grouped.map(g => (
            <SupplierGroup key={g.name} group={g} colors={colors} onOrderClick={onNavigateToOrder} />
          ))}
        </div>
      )}

      {/* Flat list */}
      {!groupBySupplier && filteredRows.length > 0 && (
        <DetailTable rows={filteredRows} onOrderClick={onNavigateToOrder} />
      )}
    </div>
  );
}

function SupplierGroup({ group, colors, onOrderClick }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
      <button onClick={() => setExpanded(p => !p)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 14px', border: 'none', background: expanded ? 'var(--bg-subtle)' : 'var(--bg-card)',
          cursor: 'pointer', textAlign: 'left',
        }}>
        <span style={{ fontFamily: 'var(--font-serif)', fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', flex: 1 }}>
          {group.name}
        </span>
        <span style={{ display: 'flex', gap: 4 }}>
          {group.types.map(t => (
            <span key={t} style={{ fontSize: 10, padding: '1px 5px', borderRadius: 3, background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text-tertiary)' }}>{t}</span>
          ))}
        </span>
        <span style={{ fontFamily: 'var(--font-serif)', fontWeight: 700, fontSize: 16, color: colors.color, minWidth: 32, textAlign: 'right' }}>
          {group.items.length}
        </span>
        <span style={{ fontSize: 14, color: 'var(--text-tertiary)' }}>{expanded ? '\u25BE' : '\u25B8'}</span>
      </button>
      {expanded && (
        <div style={{ borderTop: '1px solid var(--border)' }}>
          <DetailTable rows={group.items} onOrderClick={onOrderClick} />
        </div>
      )}
    </div>
  );
}

function DetailTable({ rows, onOrderClick }) {
  const [sortAsc, setSortAsc] = useState(true);

  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      const da = a.scadenza_effettiva || a.scadenza || '';
      const db = b.scadenza_effettiva || b.scadenza || '';
      return sortAsc ? da.localeCompare(db) : db.localeCompare(da);
    });
  }, [rows, sortAsc]);

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ background: 'var(--bg-subtle)', borderBottom: '1px solid var(--border)' }}>
            <th style={thStyle}>Tipo</th>
            <th style={thStyle}>Ordine</th>
            <th style={thStyle}>Fornitore/Cliente</th>
            <th style={thStyle}>Prodotto</th>
            <th style={{ ...thStyle, cursor: 'pointer', userSelect: 'none' }} onClick={() => setSortAsc(p => !p)}>
              Scadenza {sortAsc ? '\u25B2' : '\u25BC'}
            </th>
            <th style={thStyle}>Descrizione</th>
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((d, i) => {
            const effectiveDate = d.scadenza_effettiva || d.scadenza;
            const orderInfo = d.supplier_orders || {};
            return (
              <tr key={d.id || i} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={tdStyle}>
                  <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 5px', borderRadius: 3, background: 'var(--bg-subtle)', border: '1px solid var(--border)' }}>
                    {orderInfo.order_type}
                  </span>
                </td>
                <td style={{ ...tdStyle, fontFamily: 'var(--font-serif)', fontWeight: 600 }}>
                  {onOrderClick ? (
                    <button
                      onClick={() => onOrderClick(orderInfo.order_type, orderInfo.order_ref)}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                        fontFamily: 'var(--font-serif)', fontWeight: 600, fontSize: 12,
                        color: 'var(--accent)', textDecoration: 'none',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.textDecoration = 'underline'; }}
                      onMouseLeave={e => { e.currentTarget.style.textDecoration = 'none'; }}
                    >
                      {orderInfo.order_ref}
                    </button>
                  ) : orderInfo.order_ref}
                </td>
                <td style={tdStyle}>{orderInfo.supplier_name || orderInfo.client_name || '\u2014'}</td>
                <td style={{ ...tdStyle, fontFamily: 'var(--font-serif)' }}>{d.codice_prodotto || '\u2014'}</td>
                <td style={{ ...tdStyle, fontFamily: 'var(--font-serif)', fontWeight: 600 }}>
                  {effectiveDate ? new Date(effectiveDate).toLocaleDateString('it-IT') : '\u2014'}
                  {d.scadenza_effettiva && d.scadenza_effettiva !== d.scadenza && (
                    <span style={{ fontSize: 10, color: 'var(--text-tertiary)', marginLeft: 4 }}>
                      (orig. {new Date(d.scadenza).toLocaleDateString('it-IT')})
                    </span>
                  )}
                </td>
                <td style={tdStyle}>{d.descrizione || '\u2014'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const thStyle = { textAlign: 'left', padding: '7px 10px', fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px' };
const tdStyle = { padding: '7px 10px', color: 'var(--text-primary)' };
