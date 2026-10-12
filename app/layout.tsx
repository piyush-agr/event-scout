import type { Metadata } from "next";
import { IBM_Plex_Sans, Newsreader } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const display = Newsreader({ subsets: ["latin"], variable: "--font-display" });
const body = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-body" });

export const metadata: Metadata = {
  title: "Event Scout — weekly event digest",
  description: "An AI-powered Monday email of the professional events worth attending in the next 30 days.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>
        <header className="site-header">
          <div className="wrap">
            <Link href="/" className="brand">
              Event Scout <small>Weekly event briefing</small>
            </Link>
            <nav>
              <Link href="/#latest">Latest digest</Link>
              <Link href="/#history">Run history</Link>
              <a href="/components-map.html">Components map</a>
            </nav>
          </div>
        </header>
        <main>{children}</main>
        <footer className="site-footer">
          <div className="wrap">
            <p>
              Events are collected live from Eventbrite, AllEvents, Meetup, Luma and web search, then ranked by Gemini
              Flash. Every link goes to the page the event was found on. Nothing is hardcoded.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
