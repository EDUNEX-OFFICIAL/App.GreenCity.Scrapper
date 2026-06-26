import { getAllAdminModules } from '@greencity/shared';
import { LiveScrapePanel } from '../../components/LiveScrapePanel';

export const dynamic = 'force-dynamic';

export default function LivePage() {
  const modules = getAllAdminModules().map((m) => ({ key: m.key, label: m.label }));

  return (
    <div>
      <h1>Live</h1>
      <LiveScrapePanel modules={modules} />
    </div>
  );
}
