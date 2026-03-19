import { useState, useMemo } from 'react';
import { DataProvider, useData } from './hooks/useData';
import { computeMonthRows, computeYTDRows, groupByAgent, computeTrend, enrichOrdiniAperti } from './utils/analytics';
import { MONTH_LABELS } from './utils/parsers';
import UploadPanel from './components/UploadPanel';
import KpiBar from './components/KpiBar';
import DataTable from './components/DataTable';
import AgentView from './components/AgentView';
import OrdiniAperti from './components/OrdiniAperti';
import { TrendChart, AgentBarChart } from './components/Charts';
import { BarChart2, Users, Table, TrendingUp, Star, Package } from 'lucide-react';

const TABS = [
  { id: 'overview', label: 'Overview',       icon: BarChart2  },
  { id: 'clienti',  label: 'Per cliente',    icon: Table      },
  { id: 'agenti',   label: 'Per agente',     icon: Users      },
  { id: 'trend',    label: 'Trend',          icon: TrendingUp },
  { id: 'ordini',   label: 'Ordini aperti',  icon: Package    },
  { id: 'nuovi',    label: 'Nuovi clienti',  icon: Star       },
];

function Dashboard() {
  const { store, availableMonths, lastMonth } = useData();
  const [tab, setTab] = useState('overview');
  const [selectedMonth, setSelectedMonth] = useState(null); // null = YTD
  const [agentFilter, setAgentFilter] = useState('');

  const targetMonth = selectedMonth !== null ? selectedMonth : lastMonth;

  const rows = useMemo(() => {
    if (targetMonth === null) return [];
    return selectedMonth === null
      ? computeYTDRows(store, targetMonth)
      : computeMonthRows(store, targetMonth);
  }, [store, targetMonth, selectedMonth]);

  const agentRows  = useMemo(() => groupByAgent(rows), [rows]);
  const trendData  = useMemo(() => lastMonth !== null ? computeTrend(store, lastMonth) : [], [store, lastMonth]);
  const newClients = useMemo(() => rows.filter(r => r.isNew), [rows]);
  const ordiniEnriched = useMemo(() =>
    store.ordiniAperti ? enrichOrdiniAperti(store.ordiniAperti.rows, store.customers) : [],
    [store.ordiniAperti, store.customers]);

  const hasData = store.budgetLoaded || availableMonths.length > 0;
  const hasSales = availableMonths.length > 0;

  return (
    <div style={{ minHeight: '100vh', background: '#f5f4f1' }}>
      {/* Header */}
      <div style={{ background: 'var(--color-background-primary)', borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
        <div style={{ maxWidth: 1320, margin: '0 auto', padding: '0 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 52 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <BarChart2 size={18} color="var(--color-text-info)" />
            <span style={{ fontWeight: 500, fontSize: 15 }}>Sales Control</span>
            <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginLeft: 2 }}>Vendite vs Budget 2026</span>
          </div>
          {store.lastUpdated && (
            <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
              Agg. {new Date(store.lastUpdated).toLocaleDateString('it-IT')}
            </span>
          )}
        </div>
      </div>

      <div style={{ maxWidth: 1320, margin: '0 auto', padding: '1.25rem 1.5rem' }}>
        {/* Upload panel */}
        <div style={{ marginBottom: '1.25rem' }}>
          <UploadPanel />
        </div>

        {!hasData && (
          <div style={{ textAlign: 'center', padding: '5rem 0', color: 'var(--color-text-secondary)', fontSize: 14 }}>
            Carica il file budget per iniziare
          </div>
        )}

        {hasData && !hasSales && (
          <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--color-text-secondary)', fontSize: 14 }}>
            Budget caricato ({store.customers.length} clienti). Carica ora i file Acquisito e Fatturato del primo mese.
          </div>
        )}

        {hasSales && (
          <>
            {/* Month selector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '1.25rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>Periodo:</span>
              {[null, ...availableMonths].map(m => (
                <button key={m ?? 'ytd'} onClick={() => setSelectedMonth(m)}
                  style={{ fontSize: 12, padding: '4px 12px', borderRadius: 20, border: '0.5px solid', cursor: 'pointer',
                    background: selectedMonth === m ? 'var(--color-background-info)' : 'transparent',
                    borderColor: selectedMonth === m ? 'var(--color-border-info)' : 'var(--color-border-secondary)',
                    color: selectedMonth === m ? 'var(--color-text-info)' : 'var(--color-text-primary)' }}>
                  {m === null ? `YTD (Gen→${MONTH_LABELS[lastMonth]})` : MONTH_LABELS[m]}
                </button>
              ))}
            </div>

            {/* KPIs */}
            <div style={{ marginBottom: '1.25rem' }}>
              <KpiBar rows={rows}
                title={selectedMonth === null ? `Cumulato Gen → ${MONTH_LABELS[lastMonth]} 2026` : `${MONTH_LABELS[targetMonth]} 2026`} />
            </div>

            {/* Tabs */}
            <div style={{ borderBottom: '0.5px solid var(--color-border-tertiary)', display: 'flex', marginBottom: '1.25rem', overflowX: 'auto' }}>
              {TABS.map(t => {
                const Icon = t.icon;
                const active = tab === t.id;
                return (
                  <button key={t.id} onClick={() => setTab(t.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '9px 15px', border: 'none',
                      borderBottom: active ? '2px solid var(--color-text-info)' : '2px solid transparent',
                      background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: active ? 500 : 400,
                      color: active ? 'var(--color-text-info)' : 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
                    <Icon size={13} /> {t.label}
                    {t.id === 'nuovi' && newClients.length > 0 && (
                      <span style={{ background: 'var(--color-background-warning)', color: 'var(--color-text-warning)', fontSize: 10, borderRadius: 4, padding: '1px 5px', marginLeft: 2 }}>{newClients.length}</span>
                    )}
                    {t.id === 'ordini' && store.ordiniAperti && (
                      <span style={{ background: 'var(--color-background-info)', color: 'var(--color-text-info)', fontSize: 10, borderRadius: 4, padding: '1px 5px', marginLeft: 2 }}>{ordiniEnriched.length}</span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Tab content */}
            <div style={{ background: 'var(--color-background-primary)', borderRadius: 12, border: '0.5px solid var(--color-border-tertiary)', padding: '1.25rem' }}>

              {tab === 'overview' && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: 14 }}>
                    Acquisito vs Budget — per agente
                  </div>
                  <AgentBarChart agentRows={agentRows} />
                </div>
              )}

              {tab === 'clienti' && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Agente:</span>
                    <select value={agentFilter} onChange={e => setAgentFilter(e.target.value)}
                      style={{ fontSize: 13, padding: '5px 10px', borderRadius: 6, border: '0.5px solid var(--color-border-secondary)', background: 'var(--color-background-primary)', color: 'var(--color-text-primary)' }}>
                      <option value="">Tutti</option>
                      {[...new Set(rows.map(r => r.agente))].filter(Boolean).sort().map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                  </div>
                  <DataTable rows={rows} agentFilter={agentFilter} />
                </div>
              )}

              {tab === 'agenti' && <AgentView agentRows={agentRows} />}

              {tab === 'trend' && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: 14 }}>
                    Andamento mensile — Gen → {MONTH_LABELS[lastMonth]}
                  </div>
                  <TrendChart data={trendData} />
                </div>
              )}

              {tab === 'ordini' && (
                <OrdiniAperti enrichedRows={ordiniEnriched} fileDate={store.ordiniAperti?.fileDate} />
              )}

              {tab === 'nuovi' && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: 14 }}>
                    {newClients.length} nuovi clienti — non presenti nel budget originale, aggiunti automaticamente
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

export default function App() {
  return <DataProvider><Dashboard /></DataProvider>;
}
