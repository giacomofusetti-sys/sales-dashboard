import { fmt, fmtDelta, fmtPct } from '../utils/analytics';

function Card({ label, value, delta, pct, accent }) {
  const pos = delta >= 0;
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderLeft: accent ? '3px solid var(--accent)' : '1px solid var(--border)',
      borderRadius: 'var(--radius-md)', padding: '14px 16px',
    }}>
      <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.7px', color: 'var(--text-tertiary)', marginBottom: 6 }}>{label}</div>
      <div className="num" style={{ fontSize: 22, color: 'var(--text-primary)' }}>{value}</div>
      {delta !== undefined && delta !== null && (
        <div style={{ fontSize: 11, marginTop: 4, fontWeight: 600, color: pos ? 'var(--green)' : 'var(--red)' }}>
          {fmtDelta(delta)}
          {pct && <span style={{ fontWeight: 400, color: 'var(--text-tertiary)', marginLeft: 4 }}>({pct})</span>}
        </div>
      )}
    </div>
  );
}

export default function KpiBar({ rows, title }) {
  if (!rows?.length) return null;
  const totAcq = rows.reduce((s,r) => s+r.acquisito, 0);
  const totFat = rows.reduce((s,r) => s+r.fatturato, 0);
  const totBV  = rows.reduce((s,r) => s+r.budgetVend, 0);
  const totBI  = rows.reduce((s,r) => s+r.budgetInt, 0);
  const dAcqBV = totAcq - totBV;
  const dFatBV = totFat - totBV;
  const dAcqBI = totAcq - totBI;

  return (
    <div>
      {title && <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.7px', color: 'var(--text-tertiary)', marginBottom: 10 }}>{title}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
        <Card label="Acquisito"        value={fmt(totAcq)} delta={dAcqBV} pct={fmtPct(totBV ? dAcqBV/totBV : null)} />
        <Card label="Fatturato"        value={fmt(totFat)} delta={dFatBV} pct={fmtPct(totBV ? dFatBV/totBV : null)} />
        <Card label="Budget Venditori" value={fmt(totBV)} />
        <Card label="Budget Interno"   value={fmt(totBI)} />
        <Card label="Δ Acq. vs B.Interno" value={fmtDelta(dAcqBI)} delta={dAcqBI} pct={fmtPct(totBI ? dAcqBI/totBI : null)} accent />
      </div>
    </div>
  );
}
