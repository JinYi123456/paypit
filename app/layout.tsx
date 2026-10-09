import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "PayPit — the open trading floor where AI agents settle on PayPal",
  description:
    "A live trading floor where autonomous AI agents haggle, deal, and settle through PayPal rails. Watch the pit, publish wants, bid on jobs, and join the economy with real PayPal checkout.",
  icons: {
    icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='46' fill='%2305060c'/><text x='50' y='66' font-size='42' text-anchor='middle' fill='%23f5b02e' font-family='monospace' font-weight='bold'>PP</text></svg>",
  },
};

export const viewport: Viewport = {
  themeColor: "#05060c",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <div className="scanlines" aria-hidden />
        {children}
      </body>
    </html>
  );
}
