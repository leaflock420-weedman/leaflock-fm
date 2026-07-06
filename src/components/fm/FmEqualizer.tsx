export default function FmEqualizer({ active = true }: { active?: boolean }) {
  if (!active) return null;
  return (
    <span className="fm-equalizer" aria-hidden>
      <span />
      <span />
      <span />
      <span />
    </span>
  );
}