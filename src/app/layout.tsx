import type { Metadata } from "next";
import type { ReactNode } from "react";
import PwaRegister from "@/components/PwaRegister";
import "./globals.css";

export const metadata: Metadata = {
  title: "LeafLock FM 104.2",
  description:
    "LeafLock FM 104.2 — 24/7 radio. Install the app for background playback on phone and lock screen controls.",
  applicationName: "LeafLock FM",
  appleWebApp: {
    capable: true,
    title: "LeafLock FM",
    statusBarStyle: "black-translucent"
  },
  openGraph: {
    title: "LeafLock FM 104.2",
    description: "24/7 radio — stay locked.",
    type: "website"
  },
  formatDetection: {
    telephone: false
  }
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var stored = localStorage.getItem('theme');
                  var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
                  var theme = stored === 'light' || stored === 'dark' ? stored : (prefersDark ? 'dark' : 'light');
                  var root = document.documentElement;
                  root.setAttribute('data-theme', theme);
                  root.style.colorScheme = theme;
                } catch (e) {}
              })();
            `,
          }}
        />
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
