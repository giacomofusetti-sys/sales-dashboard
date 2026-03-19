import { useState } from 'react';
import { fmt, fmtDelta } from '../utils/analytics';
import { ChevronDown, ChevronRight, Star } from 'lucide-react';

function Delta({ n }) {
  if (n == null || isNaN(n)) return <span style={{ color: 'var(--color-text-tertiary)' }}>—</span>;
  return <span style={{ color: n >= 0 ? 'var(--color-text-success)' : 'var(--color-text-danger)', fontWeight: 500 }}>{fmtDelta(n)}</span>;
}

const COL_HEADERS = ['Agente / Cliente', 'Acquisito', 'Fatturato', 'Budget Vend.', 'Δ Acq/B.Vend', 'Δ Acq/B.Int'];

function AgentRow({ agent }) {
  const [open, setOpen] = useState(false);
  const newCount = agent.clienti.filter(c => c.isNew).length;
  return (
    <>
      <tr onClick={() => setOpen(o => !o)} style={{ cursor: 'pointer', borderBottom: '0.5px solid var(--color-border-secondary)', background: 'var(--color-background-secondary)' }}>
        <td style={{ padding: '9px 10px', fontWeight: 500 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {open ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}
            {agent.agente || '(senza agente)'}
            {newCount > 0 && <span style={{ fontSize: 11, background: 'var(--color-background-warning)', color: 'var(--color-text-warning)', borderRadius: 4, padding: '1px 6px', fontWeight: 500 }}>{newCount} nuovi</span>}
          </span>
        </td>
        <td style={{ padding: '9px 10px', textAlign: 'right' }}>{fmt(agent.acquisito)}</td>
        <td style={{ padding: '9px 10px', textAlign: 'right' }}>{fmt(agent.fatturato)}</td>
        <td style={{ padding: '9px 10px', textAlign: 'right' }}>{fmt(agent.budgetVend)}</td>
        <td style={{ padding: '9px 10px', textAlign: 'right' }}><Delta n={agent.scostAcqVsBudgetVend}/></td>
        <td style={{ padding: '9px 10px', textAlign: 'right' }}><Delta n={agent.scostAcqVsBudgetInt}/></td>
      </tr>
      {open && agent.clienti
        .sort((a,b) => b.acquisito - a.acquisito)
        .map((c, i) => (
        <tr key={c.clienteCap + i} style={{ borderBottom: '0.5px solid var(--color-border-tertiary)', background: c.isNew ? 'var(--color-background-warning)' : (i % 2 === 0 ? 'transparent' : 'var(--color-background-secondary)') }}>
          <td style={{ padding: '6px 10px 6px 34px', fontSize: 12 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              {c.isNew && <Star size={10} color="var(--color-text-warning)" fill="var(--color-text-warning)"/>}
              {c.cliente}
            </span>
          </td>
          <td style={{ padding: '6px 10px', textAlign: 'right', fontSize: 12 }}>{fmt(c.acquisito)}</td>
          <td style={{ padding: '6px 10px', textAlign: 'right', fontSize: 12 }}>{fmt(c.fatturato)}</td>
          <td style={{ padding: '6px 10px', textAlign: 'right', fontSize: 12 }}>{fmt(c.budgetVend)}</td>
          <td style={{ padding: '6px 10px', textAlign: 'right', fontSize: 12 }}><Delta n={c.scostAcqVsBudgetVend}/></td>
          <td style={{ padding: '6px 10px', textAlign: 'right', fontSize: 12 }}><Delta n={c.scostAcqVsBudgetInt}/></td>
        </tr>
      ))}
    </>
  );
}

export default function AgentView({ agentRows }) {
  if (!agentRows?.length) return <div style={{ textAlign: 'center', color: 'var(--color-text-tertiary)', padding: '2rem', fontSize: 13 }}>Nessun dato disponibile</div>;
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr style={{ borderBottom: '0.5px solid var(--color-border-secondary)' }}>
            {COL_HEADERS.map((h, i) => (
              <th key={h} style={{ padding: '8px 10px', textAlign: i === 0 ? 'left' : 'right', fontWeight: 500, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{agentRows.map(a => <AgentRow key={a.agente} agent={a}/>)}</tbody>
      </table>
    </div>
  );
}
