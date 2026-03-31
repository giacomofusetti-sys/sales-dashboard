import { useState, useCallback, useMemo } from 'react';
import { SupplierDataProvider, useSupplierData } from '../hooks/useSupplierData';
import DeadlineDashboard from './supplier/DeadlineDashboard';
import OrderList from './supplier/OrderList';
import SupplierUpload from './supplier/SupplierUpload';

const AUTH_KEY = 'sales_dashboard_auth';
const ROLE_KEY = 'sales_dashboard_role';

const TABS = [
  { id: 'scadenze', label: 'Scadenze' },
  { id: 'OV',       label: 'OV' },
  { id: 'OA',       label: 'OA' },
  { id: 'OP',       label: 'OP' },
  { id: 'OL',       label: 'OL' },
  { id: 'ACCIAIERIA', label: 'Acciaieria' },
  { id: 'upload',   label: 'Upload' },
];

const ORDER_TYPES = ['OV', 'OA', 'OP', 'OL', 'ACCIAIERIA'];

// Urgency levels from materials already loaded in context
const URGENCY = [
  { key: 'scaduti', label: 'Scaduti',    dot: '#EF4444', test: d => d < 0 },
  { key: '3g',      label: 'Entro 3gg',  dot: '#F97316', test: d => d >= 0 && d <= 3 },
  { key: '7g',      label: 'Entro 7gg',  dot: '#EAB308', test: d => d > 3 && d <= 7 },
  { key: '14g',     label: 'Entro 14gg', dot: '#22C55E', test: d => d > 7 && d <= 14 },
  { key: '30g',     label: 'Entro 30gg', dot: '#94A3B8', test: d => d > 14 && d <= 30 },
];

function daysUntilDeadline(mat) {
  const dateStr = mat.scadenza_effettiva || mat.scadenza;
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr) - new Date()) / 86400000);
}

function MonitorContent() {
  const { orders, materials, loading } = useSupplierData();
  const [tab, setTab] = useState('scadenze');
  const [highlightOrder, setHighlightOrder] = useState(null);

  const handleNavigateToOrder = useCallback((orderType, orderRef) => {
    setTab(orderType);
    setHighlightOrder(orderRef);
    setTimeout(() => setHighlightOrder(null), 3000);
  }, []);

  const handleNavigateToDeadlines = useCallback((rangeKey) => {
    setTab('scadenze');
    // DeadlineDashboard will pick up the range from its own state
  }, []);

  const handleLogout = () => {
    sessionStorage.removeItem(AUTH_KEY);
    sessionStorage.removeItem(ROLE_KEY);
    window.location.reload();
  };

  const orderCount = (type) => (orders[type] || []).length;

  // Compute urgency counts from loaded materials
  const { globalCounts, typeBadge } = useMemo(() => {
    const gc = { scaduti: 0, '3g': 0, '7g': 0, '14g': 0, '30g': 0 };
    const typeWorst = {}; // per type: worst urgency index (lower = more urgent)

    for (const type of ORDER_TYPES) {
      const ords = orders[type] || [];
      let worst = -1; // no urgency
      for (const o of ords) {
        const mats = materials[o.id] || [];
        for (const m of mats) {
          const d = daysUntilDeadline(m);
          if (d === null) continue;
          for (let i = 0; i < URGENCY.length; i++) {
            if (URGENCY[i].test(d)) {
              gc[URGENCY[i].key]++;
              if (worst === -1 || i < worst) worst = i;
              break;
            }
          }
        }
      }
      typeWorst[type] = worst;
    }

    // Badge color: worst urgency for each type
    const tb = {};
    for (const type of ORDER_TYPES) {
      const w = typeWorst[type];
      if (w >= 0 && w <= 1) tb[type] = '#EF4444'; // red: scaduti or 3gg
      else if (w === 2) tb[type] = '#F97316';      // orange: 7gg
      else tb[type] = null;
    }

    return { globalCounts: gc, typeBadge: tb };
  }, [orders, materials]);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-page)' }}>
      {/* Header */}
      <div style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ maxWidth: 1320, margin: '0 auto', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 52 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontFamily: 'var(--font-serif)', fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.3px' }}>Monitor Fornitori</span>
            <span style={{ width: 1, height: 16, background: 'var(--border-mid)' }} />
            <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Ufficio Acquisti</span>
          </div>
          <button onClick={handleLogout} style={{ fontSize: 11, padding: '5px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'none', color: 'var(--text-tertiary)', cursor: 'pointer' }}>Esci</button>
        </div>
      </div>

      {/* 1a. Urgency status bar */}
      {!loading && (
        <div style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)' }}>
          <div style={{ maxWidth: 1320, margin: '0 auto', padding: '6px 24px', display: 'flex', alignItems: 'center', gap: 16 }}>
            {URGENCY.map(u => {
              const count = globalCounts[u.key];
              if (count === 0 && u.key === '30g') return null; // hide 30g if 0
              return (
                <button key={u.key} onClick={() => handleNavigateToDeadlines(u.key)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none',
                    cursor: 'pointer', padding: '2px 0', fontSize: 12, color: 'var(--text-secondary)',
                  }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: u.dot, display: 'inline-block', flexShrink: 0 }} />
                  <span style={{ fontFamily: 'var(--font-serif)', fontWeight: 700, fontSize: 14, color: count > 0 ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>
                    {count}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{u.label.toLowerCase()}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ maxWidth: 1320, margin: '0 auto', padding: '20px 24px' }}>
        {/* Loading */}
        {loading && (
          <div style={{ textAlign: 'center', padding: '5rem 0', color: 'var(--text-tertiary)', fontSize: 13 }}>
            Connessione al database...
          </div>
        )}

        {!loading && (
          <>
            {/* 1b. Tabs with urgency badges */}
            <div style={{ borderBottom: '1px solid var(--border)', display: 'flex', marginBottom: 16, overflowX: 'auto' }}>
              {TABS.map(t => {
                const active = tab === t.id;
                const count = ORDER_TYPES.includes(t.id) ? orderCount(t.id) : null;
                const badge = typeBadge[t.id];
                return (
                  <button key={t.id} onClick={() => setTab(t.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5, padding: '9px 16px', border: 'none',
                      borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
                      background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: active ? 600 : 400,
                      color: active ? 'var(--text-primary)' : 'var(--text-tertiary)', whiteSpace: 'nowrap',
                      position: 'relative',
                    }}>
                    {t.label}
                    {count !== null && count > 0 && (
                      <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 3, background: 'var(--bg-subtle)', color: 'var(--text-tertiary)', border: '1px solid var(--border)', marginLeft: 2 }}>
                        {count}
                      </span>
                    )}
                    {badge && (
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: badge, position: 'absolute', top: 6, right: 8 }} />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Tab content */}
            <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', padding: '20px 24px' }}>
              {tab === 'scadenze' && <DeadlineDashboard onNavigateToOrder={handleNavigateToOrder} />}
              {tab === 'OV' && <OrderList orderType="OV" highlightOrder={highlightOrder} />}
              {tab === 'OA' && <OrderList orderType="OA" highlightOrder={highlightOrder} />}
              {tab === 'OP' && <OrderList orderType="OP" highlightOrder={highlightOrder} />}
              {tab === 'OL' && <OrderList orderType="OL" highlightOrder={highlightOrder} />}
              {tab === 'ACCIAIERIA' && <OrderList orderType="ACCIAIERIA" highlightOrder={highlightOrder} />}
              {tab === 'upload' && <SupplierUpload />}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function SupplierMonitor() {
  return (
    <SupplierDataProvider>
      <MonitorContent />
    </SupplierDataProvider>
  );
}
