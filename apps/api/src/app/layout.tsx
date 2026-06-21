import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Green City ERP Sync',
  description: 'ERP data extraction dashboard',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav className="nav">
          <a href="/">Overview</a>
          <a href="/modules">Modules</a>
          <a href="/live">Live</a>
          <a href="/runs">Runs</a>
          <a href="/backfill">Backfill</a>
        </nav>
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
