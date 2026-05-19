// src/components/RankBadge.jsx
const TIERS = {
  primary:  { label: 'Primary',  cls: 'rank-primary' },
  top:      { label: 'Top pick', cls: 'rank-top' },
  mentioned:{ label: 'Mid',      cls: 'rank-mid' },
  buried:   { label: 'Buried',   cls: 'rank-low' },
  absent:   { label: '—',        cls: 'rank-absent' },
};

export default function RankBadge({ tier }) {
  const t = TIERS[tier] || TIERS.absent;
  return (
    <span className={`${t.cls} text-[10px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap`}>
      {t.label}
    </span>
  );
}
