// src/components/ConsistencyPips.jsx
export default function ConsistencyPips({ pct = 0, runs = 5 }) {
  const filled = Math.round((pct / 100) * runs);
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: runs }).map((_, i) => (
        <div key={i} className={`pip ${i < filled ? 'pip-on' : 'pip-off'}`} />
      ))}
    </div>
  );
}
