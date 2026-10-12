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
          Events are collected live from Eventbrite, AllEvents, Meetup, Luma and web search, then ranked by Gemini Flash.
          Every link is the page the event was found on; nothing is hardcoded.
        </footer>
      </body>
    </html>
  );
}
