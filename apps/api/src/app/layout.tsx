import type { Metadata } from 'next';
import './globals.css';
import { AppSidebar } from '@/components/AppSidebar';

export const metadata: Metadata = {
  title: 'Green City ERP Sync',
  description: 'ERP data extraction dashboard',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="app-shell">
          <AppSidebar />
          <div className="app-main">
            <main className="container">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
