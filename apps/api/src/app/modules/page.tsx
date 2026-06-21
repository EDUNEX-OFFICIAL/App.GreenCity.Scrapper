import { getPrisma } from '@greencity/db';
import { getAllAdminModules } from '@greencity/shared';
import { TriggerButton } from '@/components/TriggerButton';
import { BulkRunButton } from '@/components/BulkRunButton';
import { WorkerStatusBanner } from '@/components/WorkerStatusBanner';
import { ExportButton } from '@/components/ExportButton';

export const dynamic = 'force-dynamic';

export default async function ModulesPage() {
  const prisma = getPrisma();
  const modules = getAllAdminModules();

  const lastRuns = await prisma.scrapeRun.findMany({
    orderBy: { createdAt: 'desc' },
    distinct: ['moduleKey'],
  });
  const lastRunMap = new Map(lastRuns.map((r) => [r.moduleKey, r]));

  const rowCounts = await prisma.rawModuleRow.groupBy({
    by: ['moduleKey'],
    _count: { id: true },
  });
  const rowCountMap = new Map(rowCounts.map((r) => [r.moduleKey, r._count.id]));

  return (
    <div>
      <h1>Modules</h1>
      <WorkerStatusBanner />
      <BulkRunButton />
      <table style={{ marginTop: '1rem' }}>
        <thead>
          <tr>
            <th>Key</th>
            <th>Label</th>
            <th>Schedule</th>
            <th>Row Count</th>
            <th>Last Status</th>
            <th>Scrape</th>
            <th>Export</th>
          </tr>
        </thead>
        <tbody>
          {modules.map((m) => {
            const last = lastRunMap.get(m.key);
            return (
              <tr key={m.key}>
                <td><a href={`/data/${m.key}`}>{m.key}</a></td>
                <td>{m.label}</td>
                <td>{m.schedule}</td>
                <td>{rowCountMap.get(m.key) ?? 0}</td>
                <td className={last ? `status-${last.status}` : ''}>{last?.status ?? '—'}</td>
                <td><TriggerButton moduleKey={m.key} portal="admin" /></td>
                <td>
                  {(rowCountMap.get(m.key) ?? 0) > 0 ? (
                    <ExportButton href={`/api/data/${m.key}/export`} small />
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
