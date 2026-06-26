export function LiveScrapePanel({ modules }: { modules: Array<{ key: string; label: string }> }) {
  return (
    <div>
      <p>Live scrape status ({modules.length} modules)</p>
    </div>
  );
}
