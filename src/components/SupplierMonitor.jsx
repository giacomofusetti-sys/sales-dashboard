import { useState, useCallback } from 'react';
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

function MonitorContent() {
  const { orders, loading } = useSupplierData();
  const [tab, setTab] = useState('scadenze');
  const [highlightOrder, setHighlightOrder] = useState(null);

  const handleNavigateToOrder = useCallback((orderType, orderRef) => {
    setTab(orderType);
    setHighlightOrder(orderRef);
    // Clear highlight after a delay
    setTimeout(() => setHighlightOrder(null), 3000);
  }, []);

  const handleLogout = () => {
    sessionStorage.removeItem(AUTH_KEY);
    sessionStorage.removeItem(ROLE_KEY);
    window.location.reload();
  };

  const orderCount = (type) => (orders[type] || []).length;

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
            {/* Tabs */}
            <div style={{ borderBottom: '1px solid var(--border)', display: 'flex', marginBottom: 16, overflowX: 'auto' }}>
              {TABS.map(t => {
                const active = tab === t.id;
                const count = ['OV', 'OA', 'OP', 'OL', 'ACCIAIERIA'].includes(t.id) ? orderCount(t.id) : null;
                return (
                  <button key={t.id} onClick={() => setTab(t.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5, padding: '9px 16px', border: 'none',
                      borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
                      background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: active ? 600 : 400,
                      color: active ? 'var(--text-primary)' : 'var(--text-tertiary)', whiteSpace: 'nowrap',
                    }}>
                    {t.label}
                    {count !== null && count > 0 && (
                      <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 3, background: 'var(--bg-subtle)', color: 'var(--text-tertiary)', border: '1px solid var(--border)', marginLeft: 2 }}>
                        {count}
                      </span>
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
