import { useState, useCallback, useEffect, useRef } from 'react';
import { searchOrders, findLinkedOrders } from '../../utils/supplierDb';

// ── Urgency color from order date ────────────────────────────
function deadlineDot(order) {
  const d = order.order_date;
  if (!d) return '#94A3B8';
  const days = Math.ceil((new Date(d) - new Date()) / 86400000);
  if (days < 0) return '#EF4444';
  if (days <= 3) return '#F97316';
  if (days <= 7) return '#EAB308';
  if (days <= 14) return '#22C55E';
  return '#94A3B8';
}

// ── Layout constants ─────────────────────────────────────────
const NODE_W = 240;
const NODE_H = 90;
const GAP_X = 80;
const GAP_Y = 24;
const PAD = 40;

// Column order: OV (clients) on the left, then OA/ACCIAIERIA, then OP/OL on the right
const COL_ORDER = ['OV', 'OA', 'ACCIAIERIA', 'OP', 'OL'];

const TYPE_LABELS = {
  OV: 'Ordini Vendita',
  OA: 'Ordini Acquisto',
  OP: 'Ordini Produzione',
  OL: 'Ordini Lavorazione',
  ACCIAIERIA: 'Acciaieria',
};

const TYPE_COLORS = {
  OV: '#3B82F6',
  OA: '#8B5CF6',
  OP: '#F59E0B',
  OL: '#10B981',
  ACCIAIERIA: '#EF4444',
};

export default function OrderMap({ onNavigateToOrder }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState(null);
  const [linked, setLinked] = useState(null); // flat array of linked orders
  const [loadingLinks, setLoadingLinks] = useState(false);
  const searchTimeout = useRef(null);

  // Debounced search
  useEffect(() => {
    if (!query.trim() || query.trim().length < 2) {
      setResults([]);
      return;
    }
    clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await searchOrders(query.trim());
        setResults(data);
      } catch (err) {
        console.error('[OrderMap] search error:', err);
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(searchTimeout.current);
  }, [query]);

  // Load links when an order is selected
  const handleSelect = useCallback(async (order) => {
    setSelected(order);
    setResults([]);
    setQuery('');
    setLoadingLinks(true);
    try {
      // Level 1: direct links
      const level1 = await findLinkedOrders(order.id, order.order_ref);

      // Level 2: links from level 1 orders (one more hop)
      const allIds = new Set([order.id, ...level1.map(o => o.id)]);
      const level2 = [];
      for (const l1 of level1) {
        try {
          const sub = await findLinkedOrders(l1.id, l1.order_ref);
          for (const s of sub) {
            if (!allIds.has(s.id)) {
              allIds.add(s.id);
              level2.push(s);
            }
          }
        } catch { /* skip */ }
      }

      setLinked([...level1, ...level2]);
    } catch (err) {
      console.error('[OrderMap] link error:', err);
      setLinked([]);
    } finally {
      setLoadingLinks(false);
    }
  }, []);

  const handleNodeClick = useCallback((order) => {
    if (onNavigateToOrder) {
      onNavigateToOrder(order.order_type, order.order_ref);
    }
  }, [onNavigateToOrder]);

  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.7px', color: 'var(--text-tertiary)', marginBottom: 14 }}>
        Mappa collegamenti tra ordini
      </div>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: 20 }}>
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Cerca numero ordine, cliente, fornitore..."
          style={{ width: '100%', maxWidth: 480, fontSize: 13, padding: '10px 14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', background: 'var(--bg-subtle)', color: 'var(--text-primary)', outline: 'none' }}
        />
        {searching && <span style={{ position: 'absolute', right: 14, top: 12, fontSize: 12, color: 'var(--text-tertiary)' }}>...</span>}

        {results.length > 0 && (
          <div style={{
            position: 'absolute', top: '100%', left: 0, right: 0, maxWidth: 480,
            background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.08)', zIndex: 10, maxHeight: 300, overflowY: 'auto', marginTop: 4,
          }}>
            {results.map(o => (
              <button key={o.id} onClick={() => handleSelect(o)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 14px', border: 'none', borderBottom: '1px solid var(--border)',
                  background: 'none', cursor: 'pointer', textAlign: 'left', fontSize: 13,
                }}>
                <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 5px', borderRadius: 3, background: TYPE_COLORS[o.order_type] || '#94A3B8', color: '#fff' }}>{o.order_type}</span>
                <span style={{ fontFamily: 'var(--font-serif)', fontWeight: 600, color: 'var(--text-primary)' }}>{o.order_ref}</span>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)', flex: 1 }}>{o.client_name || o.supplier_name || ''}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {selected && !loadingLinks && (
        <div style={{ marginBottom: 8 }}>
          <button onClick={() => { setSelected(null); setLinked(null); }}
            style={{ fontSize: 11, color: 'var(--text-tertiary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: 8 }}>
            &larr; Nuova ricerca
          </button>
        </div>
      )}

      {loadingLinks && (
        <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--text-tertiary)', fontSize: 13 }}>
          Caricamento collegamenti...
        </div>
      )}

      {selected && linked && !loadingLinks && (
        <FlowDiagram
          center={selected}
          linked={linked}
          onNodeClick={handleNodeClick}
        />
      )}

      {!selected && results.length === 0 && !searching && (
        <div style={{ textAlign: 'center', padding: '4rem 0', color: 'var(--text-tertiary)', fontSize: 13 }}>
          Cerca un ordine per visualizzare la catena di collegamento.
          <div style={{ marginTop: 8, fontSize: 11 }}>
            OV (vendita) &rarr; OA (acquisto) &rarr; OL (lavorazione) / OP (produzione)
          </div>
        </div>
      )}
    </div>
  );
}

// ── Flow diagram ─────────────────────────────────────────────

function FlowDiagram({ center, linked, onNodeClick }) {
  // Group all orders (center + linked) by type into columns
  const allOrders = [center, ...linked];
  const byType = {};
  for (const o of allOrders) {
    const t = o.order_type;
    if (!byType[t]) byType[t] = [];
    if (!byType[t].some(e => e.id === o.id)) byType[t].push(o);
  }

  // Build columns in supply-chain order, skip empty types
  const cols = [];
  const colLabels = [];
  for (const t of COL_ORDER) {
    if (byType[t]?.length) {
      cols.push(byType[t]);
      colLabels.push(TYPE_LABELS[t] || t);
    }
  }

  if (cols.length === 0) {
    cols.push([center]);
    colLabels.push(TYPE_LABELS[center.order_type] || center.order_type);
  }

  // Calculate dimensions
  const maxRows = Math.max(...cols.map(c => c.length));
  const svgW = cols.length * (NODE_W + GAP_X) - GAP_X + PAD * 2;
  const svgH = maxRows * (NODE_H + GAP_Y) - GAP_Y + PAD * 2;

  // Position nodes
  const nodePos = new Map();
  cols.forEach((col, ci) => {
    const colX = PAD + ci * (NODE_W + GAP_X);
    const totalH = col.length * (NODE_H + GAP_Y) - GAP_Y;
    const startY = PAD + (maxRows * (NODE_H + GAP_Y) - GAP_Y - totalH) / 2;
    col.forEach((order, ri) => {
      nodePos.set(order.id, { x: colX, y: startY + ri * (NODE_H + GAP_Y), order, colIdx: ci });
    });
  });

  // Build edges: connect nodes in adjacent columns
  // All nodes in column N connect to all nodes in column N+1
  // (they're linked via the ref chain)
  const edges = [];
  for (let ci = 0; ci < cols.length - 1; ci++) {
    for (const left of cols[ci]) {
      for (const right of cols[ci + 1]) {
        const lp = nodePos.get(left.id);
        const rp = nodePos.get(right.id);
        if (lp && rp) edges.push({ from: lp, to: rp });
      }
    }
  }

  return (
    <div style={{ overflowX: 'auto', background: 'var(--bg-subtle)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', padding: 4 }}>
      {/* Column headers */}
      <div style={{ display: 'flex', gap: GAP_X, paddingLeft: PAD, paddingTop: 12, paddingBottom: 4 }}>
        {colLabels.map((label, ci) => (
          <div key={ci} style={{ width: NODE_W, fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-tertiary)', textAlign: 'center' }}>
            {label}
          </div>
        ))}
      </div>

      <svg width={svgW} height={svgH} style={{ display: 'block' }}>
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth={8} markerHeight={8} orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#CBD5E1" />
          </marker>
        </defs>

        {edges.map((e, i) => {
          const x1 = e.from.x + NODE_W;
          const y1 = e.from.y + NODE_H / 2;
          const x2 = e.to.x;
          const y2 = e.to.y + NODE_H / 2;
          const cx = (x1 + x2) / 2;
          return (
            <path key={i}
              d={`M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`}
              fill="none" stroke="#CBD5E1" strokeWidth={1.5} markerEnd="url(#arrow)"
            />
          );
        })}

        {[...nodePos.entries()].map(([id, pos]) => (
          <OrderNode key={id} x={pos.x} y={pos.y} order={pos.order}
            isCenter={pos.order.id === center.id}
            onClick={() => onNodeClick(pos.order)}
          />
        ))}
      </svg>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, padding: '8px 24px 12px', fontSize: 11, color: 'var(--text-tertiary)' }}>
        {Object.entries(TYPE_LABELS).map(([k, v]) => (
          <span key={k} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: TYPE_COLORS[k] }} />
            {v}
          </span>
        ))}
      </div>

      {linked.length === 0 && (
        <div style={{ textAlign: 'center', padding: '12px 0', fontSize: 12, color: 'var(--text-tertiary)' }}>
          Nessun collegamento trovato per questo ordine.
        </div>
      )}
    </div>
  );
}

// ── SVG Order node ───────────────────────────────────────────

function OrderNode({ x, y, order, isCenter, onClick }) {
  const color = TYPE_COLORS[order.order_type] || '#94A3B8';
  const urgencyDot = deadlineDot(order);
  const name = order.client_name || order.supplier_name || '';
  const dateStr = order.order_date ? new Date(order.order_date).toLocaleDateString('it-IT') : '';

  return (
    <g style={{ cursor: 'pointer' }} onClick={onClick}>
      <rect x={x} y={y} width={NODE_W} height={NODE_H} rx={8} ry={8}
        fill="#fff" stroke={isCenter ? color : '#E2E8F0'} strokeWidth={isCenter ? 2 : 1}
      />
      {/* Type badge */}
      <rect x={x + 8} y={y + 8} width={order.order_type.length * 7 + 10} height={16} rx={3} fill={color} />
      <text x={x + 13} y={y + 20} fontSize={9} fontWeight={700} fill="#fff" fontFamily="sans-serif">{order.order_type}</text>
      {/* Order ref */}
      <text x={x + 8} y={y + 40} fontSize={13} fontWeight={700} fill="#1E293B" fontFamily="'Lora', serif">{order.order_ref}</text>
      {/* Name (truncated) */}
      <text x={x + 8} y={y + 56} fontSize={11} fill="#64748B" fontFamily="sans-serif">
        {name.length > 30 ? name.slice(0, 28) + '...' : name}
      </text>
      {/* Date + urgency dot */}
      {dateStr && (
        <>
          <circle cx={x + 14} cy={y + NODE_H - 14} r={4} fill={urgencyDot} />
          <text x={x + 22} y={y + NODE_H - 10} fontSize={11} fill="#64748B" fontFamily="'Lora', serif">{dateStr}</text>
        </>
      )}
      {/* Value */}
      {order.valore_residuo != null && (
        <text x={x + NODE_W - 8} y={y + NODE_H - 10} fontSize={11} fill="#64748B" fontFamily="'Lora', serif" textAnchor="end">
          {order.valore_residuo.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}
        </text>
      )}
    </g>
  );
}
