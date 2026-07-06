export default function FmFooter() {
  return (
    <footer className="fm-glass mt-8 px-5 py-6 text-center sm:px-7">
      <p className="text-sm font-semibold text-white">LeafLock FM 104.2</p>
      <p className="mt-1 text-sm text-emerald-400">Locked In Radio — stay locked.</p>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-3 text-sm">
        <a href="https://www.leaflock.com.au" className="fm-btn-nav" target="_blank" rel="noreferrer">
          LeafLock site
        </a>
        <a
          href="https://instagram.com/leaflockofficial"
          className="fm-btn-nav"
          target="_blank"
          rel="noreferrer"
        >
          Instagram
        </a>
      </div>
      <p className="mx-auto mt-4 max-w-lg text-xs leading-relaxed text-zinc-500">
        Music playback powered by YouTube. LeafLock FM is a branded community radio experience.
      </p>
    </footer>
  );
}