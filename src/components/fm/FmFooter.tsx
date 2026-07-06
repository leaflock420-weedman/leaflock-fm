import { ExternalLink, ShoppingBag, Sofa, Video } from "lucide-react";

const socialLinks = [
  {
    href: "https://www.youtube.com/@leaflockofficial",
    label: "YouTube",
    icon: Video
  },
  {
    href: "https://instagram.com/leaflockofficial",
    label: "Instagram",
    icon: ExternalLink
  },
  {
    href: "https://www.leaflock.com.au",
    label: "Shop LeafLock",
    icon: ShoppingBag
  },
  {
    href: "https://www.leaflock.com.au",
    label: "LeafLock",
    icon: ExternalLink
  },
  {
    href: "https://www.leaflock.com.au",
    label: "LeafLock Lounge",
    icon: Sofa
  }
];

export default function FmFooter() {
  return (
    <footer className="border-t border-zinc-800 pt-8 text-center">
      <nav className="flex flex-wrap items-center justify-center gap-3" aria-label="LeafLock links">
        {socialLinks.map((link) => {
          const Icon = link.icon;
          return (
            <a
              key={link.label}
              href={link.href}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-zinc-700 bg-zinc-950 text-zinc-400 transition-colors hover:border-emerald-500 hover:text-emerald-400"
              aria-label={link.label}
              title={link.label}
            >
              <Icon className="h-4 w-4" />
            </a>
          );
        })}
      </nav>
      <p className="mx-auto mt-4 max-w-lg text-xs leading-relaxed text-zinc-500">
        Music playback powered by YouTube. LeafLock FM is a branded community radio experience.
      </p>
    </footer>
  );
}