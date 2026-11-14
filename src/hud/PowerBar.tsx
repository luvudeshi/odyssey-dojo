// The divine power meter: a thin bar that glows when full. Shown once it has started to fill.
export function PowerBar({ power }: { power: number }) {
  if (power <= 0) return null;
  return (
    <div className={`bar-track power${power >= 1 ? " full" : ""}`} aria-label="Divine power">
      <div className="bar-fill" style={{ width: `${String(power * 100)}%` }} />
    </div>
  );
}
