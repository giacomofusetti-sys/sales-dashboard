import { useState } from 'react';
import { fmt, fmtDelta, fmtPct } from '../utils/analytics';

function Delta({ n }) {
  if (n == null || isNaN(n)) return <span style={{ color: 'var(--text-tertiary)' }}>—</span>;
  return <span style={{ color: n >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>{fmtDelta(n)}</span>;
}

function Pct({ n }) {
  if (n == null || isNaN(n) || !isFinite(n)) return <span style={{ color: 'var(--text-tertiary)' }}>—</span>;
  return <span style={{ color: n >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 600, fontSize: 11 }}>{fmtPct(n)}</span>;
}

const HDRS = ['Agente / Cliente', 'Acquisito', 'Fatturato', 'Bdg Vend.', 'Bdg Int.', 'Δ Acq/BV', '% Acq/BV', 'Δ Fat/BV', '% Fat/BV', 'Δ Acq/BI', '% Acq/BI', 'Δ Fat/BI', '% Fat/BI', 'Prev. Anno', '% Prev/BV Ann.'];

function AgentRow({ agent }) {
  const [open, setOpen] = useState(false);
  const newCount = agent.clienti.filter(c => c.isNew).length;
  const pctBadge = agent.budgetVend ? Math.round((agent.acquisito / agent.budgetVend) * 100) : null;

  return (
    <>
      <tr onClick={() => setOpen(o => !o)} style={{ cursor: 'pointer', background: 'var(--bg-subtle)', borderBottom: '1px solid var(--border)' }}>
        <td style={{ padding: '10px 12px', fontWeight: 600 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{open ? '▼' : '▶'}</span>
            {agent.agente || '(senza agente)'}
            {pctBadge !== null && (
              <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 3, background: pctBadge >= 100 ? 'var(--green-bg)' : pctBadge >= 80 ? 'var(--amber-bg)' : 'var(--red-bg)', color: pctBadge >= 100 ? 'var(--green)' : pctBadge >= 80 ? 'var(--amber)' : 'var(--red)', border: `1px solid ${pctBadge >= 100 ? 'var(--green-border)' : pctBadge >= 80 ? 'var(--amber-border)' : 'var(--red-border)'}` }}>
                {pctBadge}%
              </span>
            )}
            {newCount > 0 && <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 3, background: 'var(--amber-bg)', color: 'var(--amber)', border: '1px solid var(--amber-border)' }}>{newCount} nuovi</span>}
          </span>
        </td>
        <td style={{ padding: '10px 12px', textAlign: 'right' }}><span className="num">{fmt(agent.acquisito)}</span></td>
        <td style={{ padding: '10px 12px', textAlign: 'right' }}><span className="num">{fmt(agent.fatturato)}</span></td>
        <td style={{ padding: '10px 12px', textAlign: 'right' }}><span className="num">{fmt(agent.budgetVend)}</span></td>
        <td style={{ padding: '10px 12px', textAlign: 'right' }}><span className="num">{fmt(agent.budgetInt)}</span></td>
        <td style={{ padding: '10px 12px', textAlign: 'right' }}><Delta n={agent.scostAcqVsBudgetVend}/></td>
        <td style={{ padding: '10px 12px', textAlign: 'right' }}><Pct n={agent.pctAcqVsBudgetVend}/></td>
        <td style={{ padding: '10px 12px', textAlign: 'right' }}><Delta n={agent.scostFatVsBudgetVend}/></td>
        <td style={{ padding: '10px 12px', textAlign: 'right' }}><Pct n={agent.pctFatVsBudgetVend}/></td>
        <td style={{ padding: '10px 12px', textAlign: 'right' }}><Delta n={agent.scostAcqVsBudgetInt}/></td>
        <td style={{ padding: '10px 12px', textAlign: 'right' }}><Pct n={agent.pctAcqVsBudgetInt}/></td>
        <td style={{ padding: '10px 12px', textAlign: 'right' }}><Delta n={agent.scostFatVsBudgetInt}/></td>
        <td style={{ padding: '10px 12px', textAlign: 'right' }}><Pct n={agent.pctFatVsBudgetInt}/></td>
        <td style={{ padding: '10px 12px', textAlign: 'right' }}><span className="num">{fmt(agent.previsioneAnno)}</span></td>
        <td style={{ padding: '10px 12px', textAlign: 'right' }}><Pct n={agent.pctPrevVsBudgetVendAnn}/></td>
      </tr>
      {open && agent.clienti.sort((a,b) => b.acquisito - a.acquisito).map((c, i) => (
        <tr key={c.clienteCap+i} style={{ background: c.isNew ? 'var(--amber-bg)' : (i%2===0 ? 'var(--bg-card)' : 'var(--bg-subtle)'), borderBottom: '1px solid var(--border)' }}>
          <td style={{ padding: '7px 12px 7px 36px', fontSize: 12, color: 'var(--text-secondary)' }}>
            {c.isNew && <span style={{ fontSize: 9, background: 'var(--amber-bg)', color: 'var(--amber)', border: '1px solid var(--amber-border)', borderRadius: 3, padding: '1px 5px', fontWeight: 600, marginRight: 6 }}>NUOVO</span>}
            {c.cliente}
          </td>
          <td style={{ padding: '7px 12px', textAlign: 'right', fontSize: 12 }}><span className="num">{fmt(c.acquisito)}</span></td>
          <td style={{ padding: '7px 12px', textAlign: 'right', fontSize: 12 }}><span className="num">{fmt(c.fatturato)}</span></td>
          <td style={{ padding: '7px 12px', textAlign: 'right', fontSize: 12 }}><span className="num">{fmt(c.budgetVend)}</span></td>
          <td style={{ padding: '7px 12px', textAlign: 'right', fontSize: 12 }}><span className="num">{fmt(c.budgetInt)}</span></td>
          <td style={{ padding: '7px 12px', textAlign: 'right', fontSize: 12 }}><Delta n={c.scostAcqVsBudgetVend}/></td>
          <td style={{ padding: '7px 12px', textAlign: 'right', fontSize: 12 }}><Pct n={c.pctAcqVsBudgetVend}/></td>
          <td style={{ padding: '7px 12px', textAlign: 'right', fontSize: 12 }}><Delta n={c.scostFatVsBudgetVend}/></td>
          <td style={{ padding: '7px 12px', textAlign: 'right', fontSize: 12 }}><Pct n={c.pctFatVsBudgetVend}/></td>
          <td style={{ padding: '7px 12px', textAlign: 'right', fontSize: 12 }}><Delta n={c.scostAcqVsBudgetInt}/></td>
          <td style={{ padding: '7px 12px', textAlign: 'right', fontSize: 12 }}><Pct n={c.pctAcqVsBudgetInt}/></td>
          <td style={{ padding: '7px 12px', textAlign: 'right', fontSize: 12 }}><Delta n={c.scostFatVsBudgetInt}/></td>
          <td style={{ padding: '7px 12px', textAlign: 'right', fontSize: 12 }}><Pct n={c.pctFatVsBudgetInt}/></td>
          <td style={{ padding: '7px 12px', textAlign: 'right', fontSize: 12 }}><span className="num">{fmt(c.previsioneAnno)}</span></td>
          <td style={{ padding: '7px 12px', textAlign: 'right', fontSize: 12 }}><Pct n={c.pctPrevVsBudgetVendAnn}/></td>
        </tr>
      ))}
    </>
  );
}

export default function AgentView({ agentRows, agentFilter, onAgentFilterChange, onExportCSV, onExportAllAgents }) {
  if (!agentRows?.length) return <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: '3rem', fontSize: 13 }}>Nessun dato disponibile</div>;

  const filtered = agentFilter ? agentRows.filter(a => a.agente === agentFilter) : agentRows;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Agente:</span>
        <select value={agentFilter || ''} onChange={e => onAgentFilterChange(e.target.value)}
          style={{ fontSize: 13, padding: '6px 10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', outline: 'none' }}>
          <option value="">Tutti</option>
          {agentRows.map(a => a.agente).filter(a => a && a !== '(senza agente)').sort().map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        {agentFilter && (
          <button onClick={onExportCSV}
            style={{ fontSize: 12, padding: '6px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-secondary)', cursor: 'pointer', fontWeight: 600 }}>
            Esporta CSV
          </button>
        )}
        <button onClick={onExportAllAgents}
          style={{ fontSize: 12, padding: '6px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-secondary)', cursor: 'pointer', fontWeight: 600 }}>
          Esporta tutti gli agenti
        </button>
      </div>
      <div style={{ overflowX: 'auto', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-subtle)' }}>
              {HDRS.map((h,i) => <th key={h} style={{ padding: '8px 12px', textAlign: i===0?'left':'right', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.7px', color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>{filtered.map(a => <AgentRow key={a.agente} agent={a}/>)}</tbody>
        </table>
      </div>
    </div>
  );
}
