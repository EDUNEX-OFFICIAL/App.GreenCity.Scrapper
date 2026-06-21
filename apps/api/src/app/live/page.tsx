import { LiveScrapePanel } from '../../components/LiveScrapePanel';

export const dynamic = 'force-dynamic';

export default function LivePage() {
  return (
    <div>
      <h1>Live Scrape</h1>
      <p style={{ color: '#555', marginBottom: '1rem' }}>
        Real-time portal scrape progress — BP Management &gt; BP List first, then all admin modules page by page.
      </p>
      <LiveScrapePanel />
    </div>
  );
}
