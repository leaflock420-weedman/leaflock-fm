import { ExternalLink, Music2, Radio, ShoppingBag, Sofa, Video } from "lucide-react";

const links = [
  { href: "/fm", label: "Live FM", icon: Radio },
  { href: "https://www.youtube.com/@leaflockofficial", label: "YouTube", icon: Video, external: true },
  { href: "https://instagram.com/leaflockofficial", label: "Instagram", icon: ExternalLink, external: true },
  { href: "https://www.leaflock.com.au", label: "Shop LeafLock", icon: ShoppingBag, external: true },
  { href: "https://www.leaflock.com.au", label: "LeafLock Lounge", icon: Sofa, external: true },
  { href: "#community-jukebox", label: "Request a Track", icon: Music2 }
];

export default function FmNavLinks() {
  return (
    <nav className="flex flex-wrap gap-2" aria-label="LeafLock FM links">
      {links.map((link) => {
        const Icon = link.icon;
        const className = `fm-btn-nav ${link.label === "Shop LeafLock" ? "fm-btn-nav--gold" : ""}`;
        if (link.external) {
          return (
            <a
              key={link.label}
              href={link.href}
              target="_blank"
              rel="noreferrer"
              className={className}
            >
              <Icon className="h-3.5 w-3.5" />
              {link.label}
            </a>
          );
        }
        return (
          <a key={link.label} href={link.href} className={className}>
            <Icon className="h-3.5 w-3.5" />
            {link.label}
          </a>
        );
      })}
    </nav>
  );
}