import { fmt, fmtDelta, fmtPct } from '../utils/analytics';

function Card({ label, value, delta, pct }) {
  const pos = delta >= 0;
  return (
    <div style={{ background: 'var(--color-background-secondary)', borderRadius: 8, padding: '0.875rem 1rem' }}>
      <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 21, fontWeight: 500 }}>{value}</div>
      {delta !== undefined && (
        <div style={{ fontSize: 12, marginTop: 3, color: pos ? 'var(--color-text-success)' : 'var(--color-text-danger)', fontWeight: 500 }}>
          {fmtDelta(delta)}
          {pct && <span style={{ fontWeight: 400, color: 'var(--color-text-tertiary)', marginLeft: 4 }}>({pct})</span>}
        </div>
      )}
    </div>
  );
}

export default function KpiBar({ rows, title }) {
  if (!rows?.length) return null;
  const totAcq = rows.reduce((s, r) => s + r.acquisito, 0);
  const totFat = rows.reduce((s, r) => s + r.fatturato, 0);
  const totBV  = rows.reduce((s, r) => s + r.budgetVend, 0);
  const totBI  = rows.reduce((s, r) => s + r.budgetInt, 0);
  const dAcqBV = totAcq - totBV;
  const dFatBV = totFat - totBV;
  const dAcqBI = totAcq - totBI;

  return (
    <div>
      {title && <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 10, fontWeight: 500 }}>{title}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
        <Card label="Acquisito" value={fmt(totAcq)} delta={dAcqBV} pct={fmtPct(totBV ? dAcqBV/totBV : null)} />
        <Card label="Fatturato" value={fmt(totFat)} delta={dFatBV} pct={fmtPct(totBV ? dFatBV/totBV : null)} />
        <Card label="Budget Venditori" value={fmt(totBV)} />
        <Card label="Budget Interno" value={fmt(totBI)} />
        <Card label="Δ Acq. vs B.Interno" value={fmtDelta(dAcqBI)} delta={dAcqBI} pct={fmtPct(totBI ? dAcqBI/totBI : null)} />
      </div>
    </div>
  );
}
