import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "D^3 Ticketing - Admin",
  description: "Event check-in admin: passes, QR tickets, scanning and analytics.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/passes", label: "Passes" },
  { href: "/participants", label: "Participants" },
  { href: "/scan", label: "Scanner" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-zinc-100 text-zinc-900 antialiased">
        <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white">
          <div className="mx-auto max-w-6xl px-4 py-3">
            <Link href="/" className="text-lg font-bold tracking-tight">
              D<sup>3</sup> Ticketing
            </Link>
            <nav className="-mx-1 mt-1 flex gap-1 overflow-x-auto px-1 pb-0.5 text-sm">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="whitespace-nowrap rounded-md px-3 py-2 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-5 sm:py-6">{children}</main>
      </body>
    </html>
  );
}
