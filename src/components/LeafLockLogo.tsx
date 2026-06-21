"use client";

import Image from "next/image";
import { useState } from "react";

type LeafLockLogoProps = {
  className?: string;
  onSecretTap?: () => void;
};

export default function LeafLockLogo({ className = "", onSecretTap }: LeafLockLogoProps) {
  const [tapCount, setTapCount] = useState(0);
  const [useFallback, setUseFallback] = useState(false);

  function handleTap() {
    if (!onSecretTap) return;
    const next = tapCount + 1;
    if (next >= 3) {
      setTapCount(0);
      onSecretTap();
      return;
    }
    setTapCount(next);
    window.setTimeout(() => setTapCount(0), 900);
  }

  const src = useFallback ? "/icon" : "/leaflock-logo.png";

  return (
    <button
      type="button"
      onClick={handleTap}
      className={`relative block w-full max-w-[280px] border-0 bg-transparent p-0 shadow-none outline-none sm:max-w-[340px] ${onSecretTap ? "cursor-pointer" : "cursor-default"} ${className}`}
      aria-label="LeafLock FM"
    >
      <Image
        src={src}
        alt="LeafLock"
        width={680}
        height={120}
        className="h-auto w-full bg-transparent object-contain object-left"
        onError={() => setUseFallback(true)}
        priority
      />
    </button>
  );
}