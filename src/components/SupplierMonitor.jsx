import { useState, useCallback, useMemo } from 'react';
import { SupplierDataProvider, useSupplierData } from '../hooks/useSupplierData';
import DeadlineDashboard from './supplier/DeadlineDashboard';
import OrderList from './supplier/OrderList';
import OrderMap from './supplier/OrderMap';
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
  { id: 'mappa',    label: 'Mappa' },
];

const ORDER_TYPES = ['OV', 'OA', 'OP', 'OL', 'ACCIAIERIA'];

// Urgency levels from materials already loaded in context
const URGENCY_LEVELS = [
  { idx: 0, test: d => d < 0 },       // scaduti
  { idx: 1, test: d => d >= 0 && d <= 3 },  // 3gg
  { idx: 2, test: d => d > 3 && d <= 7 },   // 7gg
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
  const [returnTo, setReturnTo] = useState(null); // tab to return to (e.g. 'mappa')

  const handleNavigateToOrder = useCallback((orderType, orderRef) => {
    setReturnTo(tab); // remember where we came from
    setTab(orderType);
    setHighlightOrder(orderRef);
    setTimeout(() => setHighlightOrder(null), 3000);
  }, [tab]);

  const handleLogout = () => {
    sessionStorage.removeItem(AUTH_KEY);
    sessionStorage.removeItem(ROLE_KEY);
    window.location.reload();
  };

  const orderCount = (type) => (orders[type] || []).length;

  // Compute urgency badge per type from loaded materials
  const typeBadge = useMemo(() => {
    const tb = {};
    for (const type of ORDER_TYPES) {
      const ords = orders[type] || [];
      let worst = -1;
      for (const o of ords) {
        for (const m of (materials[o.id] || [])) {
          const d = daysUntilDeadline(m);
          if (d === null) continue;
          for (const lvl of URGENCY_LEVELS) {
            if (lvl.test(d) && (worst === -1 || lvl.idx < worst)) {
              worst = lvl.idx;
              break;
            }
          }
          if (worst === 0) break;
        }
        if (worst === 0) break;
      }
      if (worst >= 0 && worst <= 1) tb[type] = '#EF4444';
      else if (worst === 2) tb[type] = '#F97316';
      else tb[type] = null;
    }
    return tb;
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
            <div style={{ borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', marginBottom: 16, overflowX: 'auto' }}>
              {TABS.map(t => {
                const active = tab === t.id;
                const count = ORDER_TYPES.includes(t.id) ? orderCount(t.id) : null;
                const badge = typeBadge[t.id];
                return (
                  <button key={t.id} onClick={() => { setTab(t.id); setReturnTo(null); }}
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
              <span style={{ flex: 1 }} />
              <button onClick={() => { setTab('upload'); setReturnTo(null); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5, padding: '6px 14px', marginBottom: 4,
                  border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                  background: tab === 'upload' ? 'var(--accent)' : 'var(--bg-subtle)',
                  color: tab === 'upload' ? '#fff' : 'var(--text-secondary)',
                  whiteSpace: 'nowrap', transition: 'background 0.15s',
                }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                Upload
              </button>
            </div>

            {/* Return-to banner */}
            {returnTo && (
              <button onClick={() => { setTab(returnTo); setReturnTo(null); setHighlightOrder(null); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10,
                  padding: '6px 12px', fontSize: 12, fontWeight: 500,
                  background: 'var(--bg-subtle)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
                  color: 'var(--accent)', cursor: 'pointer',
                }}>
                &larr; Torna a {TABS.find(t => t.id === returnTo)?.label || returnTo}
              </button>
            )}

            {/* Tab content */}
            <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', padding: '20px 24px' }}>
              {tab === 'scadenze' && <DeadlineDashboard onNavigateToOrder={handleNavigateToOrder} />}
              {tab === 'OV' && <OrderList orderType="OV" highlightOrder={highlightOrder} />}
              {tab === 'OA' && <OrderList orderType="OA" highlightOrder={highlightOrder} />}
              {tab === 'OP' && <OrderList orderType="OP" highlightOrder={highlightOrder} />}
              {tab === 'OL' && <OrderList orderType="OL" highlightOrder={highlightOrder} />}
              {tab === 'ACCIAIERIA' && <OrderList orderType="ACCIAIERIA" highlightOrder={highlightOrder} />}
              {tab === 'mappa' && <OrderMap onNavigateToOrder={handleNavigateToOrder} />}
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
