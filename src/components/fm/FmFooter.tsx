"use client";

import { ExternalLink, Gamepad2 } from "lucide-react";
import { useEffect, useState } from "react";

type PublicLinks = {
  websiteUrl?: string;
  mobileGameUrl?: string;
  officialYoutubeUrl?: string;
  instagramUrl?: string;
};

export default function FmFooter() {
  const [links, setLinks] = useState<PublicLinks>({});

  useEffect(() => {
    void fetch("/api/fm/config", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload: { links?: PublicLinks }) => {
        setLinks(payload.links ?? {});
      })
      .catch(() => {
        // Ignore config errors.
      });
  }, []);

  const footerLinks = [
    links.websiteUrl
      ? { href: links.websiteUrl, label: "Website", icon: ExternalLink }
      : null,
    links.mobileGameUrl
      ? { href: links.mobileGameUrl, label: "Play Game", icon: Gamepad2 }
      : null
  ].filter(Boolean) as Array<{
    href: string;
    label: string;
    icon: typeof ExternalLink;
  }>;

  return (
    <footer className="border-t border-zinc-800 pt-8 text-center">
      {footerLinks.length > 0 ? (
        <nav className="flex flex-wrap items-center justify-center gap-3" aria-label="LeafLock links">
          {footerLinks.map((link) => {
            const Icon = link.icon;
            return (
              <a
                key={link.label}
                href={link.href}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-9 items-center gap-2 rounded-full border border-zinc-700 bg-zinc-950 px-4 text-xs font-semibold text-zinc-400 transition-colors hover:border-emerald-500 hover:text-emerald-400"
                aria-label={link.label}
                title={link.label}
              >
                <Icon className="h-4 w-4" />
                {link.label}
              </a>
            );
          })}
        </nav>
      ) : null}
      <p className="mx-auto mt-4 max-w-lg text-xs leading-relaxed text-zinc-500">
        Live Room uses continuous native radio (Locked In Radio). Private jukebox uses YouTube for
        personal shuffle only.
      </p>
    </footer>
  );
}