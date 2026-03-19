import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { MONTH_LABELS } from '../utils/parsers';
import { fmt } from '../utils/analytics';

function EuroTip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', fontSize: 12, fontFamily: 'var(--font-sans)' }}>
      <div style={{ fontWeight: 600, marginBottom: 6, color: 'var(--text-primary)' }}>{MONTH_LABELS[label] || label}</div>
      {payload.map(p => (
        <div key={p.dataKey} style={{ display: 'flex', justifyContent: 'space-between', gap: 20, color: p.color, marginBottom: 2 }}>
          <span>{p.name}</span><span style={{ fontWeight: 700, fontFamily: 'var(--font-serif)' }}>{fmt(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

function AgentTip({ active, payload }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', fontSize: 12 }}>
      <div style={{ fontWeight: 600, marginBottom: 6 }}>{payload[0]?.payload?.fullName}</div>
      {payload.map(p => (
        <div key={p.dataKey} style={{ display: 'flex', justifyContent: 'space-between', gap: 20, color: p.color, marginBottom: 2 }}>
          <span>{p.name}</span><span style={{ fontWeight: 700, fontFamily: 'var(--font-serif)' }}>{fmt(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

const TICK = { fontSize: 11, fill: '#a8a49c', fontFamily: 'var(--font-sans)' };

export function TrendChart({ data }) {
  if (!data?.length) return null;
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data.map(d => ({...d, name: d.month}))} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e8e5df" vertical={false} />
        <XAxis dataKey="name" tickFormatter={m => MONTH_LABELS[m]||m} tick={TICK} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={v => (v/1000).toFixed(0)+'k'} tick={TICK} axisLine={false} tickLine={false} width={44} />
        <Tooltip content={<EuroTip />} />
        <Legend wrapperStyle={{ fontSize: 12, fontFamily: 'var(--font-sans)' }} />
        <Bar dataKey="acquisito"  name="Acquisito"        fill="#1a1814" radius={[3,3,0,0]} />
        <Bar dataKey="fatturato"  name="Fatturato"        fill="#6b6760" radius={[3,3,0,0]} />
        <Bar dataKey="budgetVend" name="Budget Venditori" fill="#d4d0c8" radius={[3,3,0,0]} />
        <Bar dataKey="budgetInt"  name="Budget Interno"   fill="#e8e5df" radius={[3,3,0,0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function AgentBarChart({ agentRows }) {
  if (!agentRows?.length) return null;
  const data = agentRows.slice(0,12).map(a => ({
    name: a.agente.split(' ').slice(-1)[0],
    fullName: a.agente,
    acquisito: a.acquisito,
    budgetVend: a.budgetVend,
  }));
  return (
    <ResponsiveContainer width="100%" height={Math.max(200, data.length*42)}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e8e5df" horizontal={false} />
        <XAxis type="number" tickFormatter={v => (v/1000).toFixed(0)+'k'} tick={TICK} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="name" tick={TICK} axisLine={false} tickLine={false} width={76} />
        <Tooltip content={<AgentTip />} />
        <Legend wrapperStyle={{ fontSize: 12, fontFamily: 'var(--font-sans)' }} />
        <Bar dataKey="acquisito"  name="Acquisito" fill="#1a1814" radius={[0,3,3,0]} />
        <Bar dataKey="budgetVend" name="Budget"    fill="#d4d0c8" radius={[0,3,3,0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
