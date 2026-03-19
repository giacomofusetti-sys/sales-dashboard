import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { MONTH_LABELS } from '../utils/parsers';
import { fmt } from '../utils/analytics';

function EuroTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-secondary)', borderRadius: 8, padding: '10px 14px', fontSize: 13 }}>
      <div style={{ fontWeight: 500, marginBottom: 6 }}>{MONTH_LABELS[label] || label}</div>
      {payload.map(p => (
        <div key={p.dataKey} style={{ display: 'flex', justifyContent: 'space-between', gap: 20, color: p.color, marginBottom: 2 }}>
          <span>{p.name}</span><span style={{ fontWeight: 500 }}>{fmt(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

function AgentTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-secondary)', borderRadius: 8, padding: '10px 14px', fontSize: 13 }}>
      <div style={{ fontWeight: 500, marginBottom: 6 }}>{payload[0]?.payload?.fullName}</div>
      {payload.map(p => (
        <div key={p.dataKey} style={{ display: 'flex', justifyContent: 'space-between', gap: 20, color: p.color, marginBottom: 2 }}>
          <span>{p.name}</span><span style={{ fontWeight: 500 }}>{fmt(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

export function TrendChart({ data }) {
  if (!data?.length) return null;
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data.map(d => ({ ...d, name: d.month }))} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-tertiary)" vertical={false} />
        <XAxis dataKey="name" tickFormatter={m => MONTH_LABELS[m] || m} tick={{ fontSize: 12, fill: 'var(--color-text-secondary)' }} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={v => (v/1000).toFixed(0)+'k'} tick={{ fontSize: 11, fill: 'var(--color-text-secondary)' }} axisLine={false} tickLine={false} width={44} />
        <Tooltip content={<EuroTooltip />} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="acquisito"  name="Acquisito"        fill="#1D9E75" radius={[3,3,0,0]} />
        <Bar dataKey="fatturato"  name="Fatturato"        fill="#378ADD" radius={[3,3,0,0]} />
        <Bar dataKey="budgetVend" name="Budget Venditori" fill="#D85A30" radius={[3,3,0,0]} opacity={0.65} />
        <Bar dataKey="budgetInt"  name="Budget Interno"   fill="#888780" radius={[3,3,0,0]} opacity={0.5} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function AgentBarChart({ agentRows }) {
  if (!agentRows?.length) return null;
  const data = agentRows.slice(0, 12).map(a => ({
    name: a.agente.split(' ').slice(-1)[0],
    fullName: a.agente,
    acquisito: a.acquisito,
    budgetVend: a.budgetVend,
    fatturato: a.fatturato,
  }));
  return (
    <ResponsiveContainer width="100%" height={Math.max(200, data.length * 38)}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-tertiary)" horizontal={false} />
        <XAxis type="number" tickFormatter={v => (v/1000).toFixed(0)+'k'} tick={{ fontSize: 11, fill: 'var(--color-text-secondary)' }} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: 'var(--color-text-secondary)' }} axisLine={false} tickLine={false} width={72} />
        <Tooltip content={<AgentTooltip />} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="acquisito"  name="Acquisito" fill="#1D9E75" radius={[0,3,3,0]} />
        <Bar dataKey="budgetVend" name="Budget"    fill="#D85A30" radius={[0,3,3,0]} opacity={0.65} />
      </BarChart>
    </ResponsiveContainer>
  );
}
