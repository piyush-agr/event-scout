import type { Metadata } from "next";
import { Atkinson_Hyperlegible, Bricolage_Grotesque } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-display" });
const body = Atkinson_Hyperlegible({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-body" });

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
              <span className="brand-mark" aria-hidden="true" />
              Event Scout
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
