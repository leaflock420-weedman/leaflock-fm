const PLACEHOLDER_SCHEDULE = [
  { title: "Morning Lock-In", time: "9:00 AM", copy: "Chill rotation" },
  { title: "Work Mode", time: "12:00 PM", copy: "Background blends" },
  { title: "Smoke Break Sessions", time: "4:20 PM", copy: "Community picks" },
  { title: "Late Night Locked", time: "9:00 PM", copy: "Slower, darker blends" }
];

export default function FmScheduleCards() {
  return (
    <section className="fm-glass p-4 sm:p-6" aria-label="Station schedule">
      <p className="text-xs font-bold uppercase tracking-[0.22em] text-zinc-500">
        Today on LeafLock FM
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {PLACEHOLDER_SCHEDULE.map((item) => (
          <article key={item.title} className="fm-schedule-card">
            <time>{item.time}</time>
            <h3 className="mt-1 text-base font-semibold text-white">{item.title}</h3>
            <p className="mt-1 text-sm text-zinc-400">{item.copy}</p>
          </article>
        ))}
      </div>
      <p className="mt-4 text-center text-xs text-zinc-500">
        Full weekly schedule coming soon.
      </p>
    </section>
  );
}