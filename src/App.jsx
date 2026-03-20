import { useState, useMemo } from 'react';
import { DataProvider, useData } from './hooks/useData';
import { computeMonthRows, computeYTDRows, groupByAgent, computeTrend, enrichOrdiniAperti, exportCSV } from './utils/analytics';
import { MONTH_LABELS } from './utils/parsers';
import UploadPanel from './components/UploadPanel';
import KpiBar from './components/KpiBar';
import DataTable from './components/DataTable';
import AgentView from './components/AgentView';
import OrdiniAperti from './components/OrdiniAperti';
import { TrendChart, AgentBarChart } from './components/Charts';

const TABS = [
  { id: 'overview', label: 'Overview'       },
  { id: 'clienti',  label: 'Per cliente'    },
  { id: 'agenti',   label: 'Per agente'     },
  { id: 'trend',    label: 'Trend'          },
  { id: 'ordini',   label: 'Ordini aperti'  },
  { id: 'nuovi',    label: 'Nuovi clienti'  },
];

const UPLOAD_PASSWORD = import.meta.env.VITE_UPLOAD_PASSWORD || 'vendite2026';

function LoginBanner({ onUnlock }) {
  const [pwd, setPwd] = useState('');
  const [err, setErr] = useState(false);
  const check = () => {
    if (pwd === UPLOAD_PASSWORD) { onUnlock(); setErr(false); }
    else setErr(true);
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', marginBottom: 16 }}>
      <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginRight: 4 }}>Sblocca upload:</span>
      <input
        type="password" value={pwd} onChange={e => { setPwd(e.target.value); setErr(false); }}
        onKeyDown={e => e.key === 'Enter' && check()}
        placeholder="Password..."
        style={{ fontSize: 13, padding: '5px 10px', borderRadius: 'var(--radius-sm)', border: `1px solid ${err ? 'var(--red)' : 'var(--border)'}`, outline: 'none', width: 160 }}
      />
      <button onClick={check} style={{ fontSize: 12, padding: '5px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--accent)', color: '#fff', fontWeight: 600 }}>
        Accedi
      </button>
      {err && <span style={{ fontSize: 12, color: 'var(--red)' }}>Password errata</span>}
      <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginLeft: 8 }}>Solo per il caricamento file. La dashboard è sempre visibile.</span>
    </div>
  );
}

function Dashboard() {
  const { store, loading, availableMonths, lastMonth } = useData();
  const [tab, setTab] = useState('overview');
  const [selectedMonth, setSelectedMonth] = useState(null);
  const [agentFilter, setAgentFilter] = useState('');
  const [agentViewFilter, setAgentViewFilter] = useState('');
  const [canUpload, setCanUpload] = useState(false);

  const targetMonth = selectedMonth !== null ? selectedMonth : lastMonth;

  const rows = useMemo(() => {
    if (targetMonth === null) return [];
    return selectedMonth === null ? computeYTDRows(store, targetMonth) : computeMonthRows(store, targetMonth);
  }, [store, targetMonth, selectedMonth]);

  const agentRows     = useMemo(() => groupByAgent(rows), [rows]);
  const trendData     = useMemo(() => lastMonth !== null ? computeTrend(store, lastMonth) : [], [store, lastMonth]);
  const newClients    = useMemo(() => rows.filter(r => r.isNew), [rows]);
  const ordiniEnriched = useMemo(() =>
    store.ordiniAperti ? enrichOrdiniAperti(store.ordiniAperti.rows, store.customers) : [],
    [store.ordiniAperti, store.customers]);

  const hasSales = availableMonths.length > 0;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-page)' }}>
      {/* Header */}
      <div style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ maxWidth: 1320, margin: '0 auto', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 52 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontFamily: 'var(--font-serif)', fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.3px' }}>Sales Control</span>
            <span style={{ width: 1, height: 16, background: 'var(--border-mid)' }} />
            <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Vendite vs Budget 2026</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {store.lastUpdated && <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Agg. {new Date(store.lastUpdated).toLocaleDateString('it-IT')}</span>}
            {!canUpload
              ? <button onClick={() => setCanUpload(true)} style={{ fontSize: 12, padding: '5px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-secondary)', cursor: 'pointer' }}>Carica file</button>
              : <button onClick={() => setCanUpload(false)} style={{ fontSize: 12, padding: '5px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg-subtle)', color: 'var(--text-tertiary)', cursor: 'pointer' }}>Chiudi upload</button>
            }
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1320, margin: '0 auto', padding: '20px 24px' }}>
        {/* Upload area — shown only when unlocked */}
        {canUpload && <PasswordGate canUpload={canUpload} setCanUpload={setCanUpload} />}

        {/* Loading state */}
        {loading && !hasSales && (
          <div style={{ textAlign: 'center', padding: '5rem 0', color: 'var(--text-tertiary)', fontSize: 13 }}>
            Connessione al database...
          </div>
        )}

        {!loading && !store.budgetLoaded && (
          <div style={{ textAlign: 'center', padding: '5rem 0', color: 'var(--text-tertiary)', fontSize: 13 }}>
            Nessun dato. Clicca "Carica file" in alto a destra per iniziare.
          </div>
        )}

        {!loading && store.budgetLoaded && !hasSales && (
          <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--text-tertiary)', fontSize: 13 }}>
            Budget caricato ({store.customers.length} clienti). Carica ora i file Acquisito e Fatturato.
          </div>
        )}

        {hasSales && (
          <>
            {/* Period selector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginRight: 4, textTransform: 'uppercase', letterSpacing: '0.6px', fontWeight: 600 }}>Periodo</span>
              {[null, ...availableMonths].map(m => (
                <button key={m??'ytd'} onClick={() => setSelectedMonth(m)}
                  style={{ fontSize: 12, padding: '4px 14px', borderRadius: 20, border: '1px solid', cursor: 'pointer',
                    background: selectedMonth===m ? 'var(--accent)' : 'var(--bg-card)',
                    borderColor: selectedMonth===m ? 'var(--accent)' : 'var(--border)',
                    color: selectedMonth===m ? '#fff' : 'var(--text-secondary)', fontWeight: selectedMonth===m ? 600 : 400 }}>
                  {m===null ? `YTD Gen→${MONTH_LABELS[lastMonth]}` : MONTH_LABELS[m]}
                </button>
              ))}
            </div>

            {/* KPIs */}
            <div style={{ marginBottom: 18 }}>
              <KpiBar rows={rows} title={selectedMonth===null ? `Cumulato Gen → ${MONTH_LABELS[lastMonth]} 2026` : `${MONTH_LABELS[targetMonth]} 2026`} />
            </div>

            {/* Tabs */}
            <div style={{ borderBottom: '1px solid var(--border)', display: 'flex', marginBottom: 16, overflowX: 'auto' }}>
              {TABS.map(t => {
                const active = tab === t.id;
                return (
                  <button key={t.id} onClick={() => setTab(t.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '9px 16px', border: 'none',
                      borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
                      background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: active ? 600 : 400,
                      color: active ? 'var(--text-primary)' : 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
                    {t.label}
                    {t.id==='nuovi' && newClients.length>0 && <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 3, background: 'var(--amber-bg)', color: 'var(--amber)', border: '1px solid var(--amber-border)', marginLeft: 2 }}>{newClients.length}</span>}
                    {t.id==='ordini' && store.ordiniAperti && <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 3, background: 'var(--bg-subtle)', color: 'var(--text-tertiary)', border: '1px solid var(--border)', marginLeft: 2 }}>{ordiniEnriched.length}</span>}
                  </button>
                );
              })}
            </div>

            {/* Tab content */}
            <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', padding: '20px 24px' }}>
              {tab==='overview' && (
                <div>
                  <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.7px', color: 'var(--text-tertiary)', marginBottom: 16 }}>Acquisito vs budget — per agente</div>
                  <AgentBarChart agentRows={agentRows} />
                </div>
              )}
              {tab==='clienti' && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Agente:</span>
                    <select value={agentFilter} onChange={e => setAgentFilter(e.target.value)}
                      style={{ fontSize: 13, padding: '6px 10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', outline: 'none' }}>
                      <option value="">Tutti</option>
                      {[...new Set(rows.map(r=>r.agente))].filter(Boolean).sort().map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                  </div>
                  <DataTable rows={rows} agentFilter={agentFilter} />
                </div>
              )}
              {tab==='agenti' && <AgentView agentRows={agentRows} agentFilter={agentViewFilter} onAgentFilterChange={setAgentViewFilter} onExportCSV={() => {
                const agent = agentRows.find(a => a.agente === agentViewFilter);
                if (agent) exportCSV(agent.clienti, `${agentViewFilter.replace(/\s+/g, '_')}_clienti.csv`);
              }} />}
              {tab==='trend' && (
                <div>
                  <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.7px', color: 'var(--text-tertiary)', marginBottom: 16 }}>Andamento mensile — Gen → {MONTH_LABELS[lastMonth]}</div>
                  <TrendChart data={trendData} />
                </div>
              )}
              {tab==='ordini' && <OrdiniAperti enrichedRows={ordiniEnriched} fileDate={store.ordiniAperti?.fileDate} />}
              {tab==='nuovi' && (
                <div>
                  <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.7px', color: 'var(--text-tertiary)', marginBottom: 14 }}>
                    {newClients.length} nuovi clienti — non presenti nel budget originale
                  </div>
                  <DataTable rows={rows} showNewOnly />
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function PasswordGate({ setCanUpload }) {
  const { store, resetAll } = useData();
  const [unlocked, setUnlocked] = useState(false);
  const [pwd, setPwd] = useState('');
  const [err, setErr] = useState(false);

  const check = () => {
    if (pwd === UPLOAD_PASSWORD) { setUnlocked(true); setErr(false); }
    else setErr(true);
  };

  return (
    <div style={{ marginBottom: 16, background: 'var(--bg-subtle)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '16px 20px' }}>
      {!unlocked ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Password per caricare file:</span>
          <input type="password" value={pwd} onChange={e => { setPwd(e.target.value); setErr(false); }}
            onKeyDown={e => e.key==='Enter' && check()} placeholder="Password..."
            style={{ fontSize: 13, padding: '6px 10px', borderRadius: 'var(--radius-sm)', border: `1px solid ${err ? 'var(--red)' : 'var(--border)'}`, outline: 'none', width: 160 }} />
          <button onClick={check} style={{ fontSize: 12, padding: '6px 16px', borderRadius: 'var(--radius-sm)', border: 'none', background: 'var(--accent)', color: '#fff', fontWeight: 600 }}>Accedi</button>
          {err && <span style={{ fontSize: 12, color: 'var(--red)' }}>Password errata</span>}
        </div>
      ) : (
        <div>
          <UploadPanel canUpload={true} />
          {(store.budgetLoaded || Object.keys(store.acquisito).length>0) && (
            <div style={{ marginTop: 8, textAlign: 'right' }}>
              <button onClick={resetAll} style={{ fontSize: 11, color: 'var(--red)', background: 'none', border: 'none', cursor: 'pointer' }}>Reset tutti i dati</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function App() {
  return <DataProvider><Dashboard /></DataProvider>;
}
