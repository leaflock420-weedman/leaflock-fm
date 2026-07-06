"use client";

import LeafLockLogo from "@/components/LeafLockLogo";

export default function FmHero() {
  return (
    <header className="text-center">
      <LeafLockLogo
        className="mx-auto"
        onSecretTap={() => window.dispatchEvent(new Event("leaflock:open-desk"))}
      />
      <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.28em] text-emerald-400">
        LeafLock FM 104.2
      </p>
      <h1 className="mt-1 text-xl font-bold tracking-tight text-white sm:text-2xl">
        Locked In Radio
      </h1>
    </header>
  );
}