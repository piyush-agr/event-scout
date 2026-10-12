import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Event Scout — weekly event digest",
  description: "An AI-powered Monday email of the professional events worth attending in the next 30 days.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <Link href="/" className="brand">
            Event Scout
          </Link>
          <nav>
            <Link href="/#history">Run history</Link>
            <a href="/components-map.html">Components map</a>
          </nav>
        </header>
        <main>{children}</main>
        <footer className="site-footer">
          Events come from live Google Search via Gemini Flash. Every link was returned by that search; nothing is
          hardcoded.
        </footer>
      </body>
    </html>
  );
}
