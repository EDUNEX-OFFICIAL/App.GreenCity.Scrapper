import { getPrisma } from '@greencity/db';
import { getAllAdminModules } from '@greencity/shared';
import { WorkerStatusBanner } from '@/components/WorkerStatusBanner';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const prisma = getPrisma();
  const [runCount, rowCount, failCount, bpCount, recentRuns] = await Promise.all([
    prisma.scrapeRun.count(),
    prisma.rawModuleRow.count(),
    prisma.scrapeFailure.count(),
    prisma.bpSession.count(),
    prisma.scrapeRun.findMany({ orderBy: { createdAt: 'desc' }, take: 10 }),
  ]);

  const modules = getAllAdminModules();

  return (
    <div>
      <h1>Green City ERP Sync</h1>
      <WorkerStatusBanner />
      <div className="grid" style={{ marginTop: '1rem' }}>
        <div className="card"><div>Total Runs</div><div className="stat">{runCount}</div></div>
        <div className="card"><div>Total Rows</div><div className="stat">{rowCount}</div></div>
        <div className="card"><div>Failures</div><div className="stat">{failCount}</div></div>
        <div className="card"><div>BP Sessions</div><div className="stat">{bpCount}</div></div>
        <div className="card"><div>Admin Modules</div><div className="stat">{modules.length}</div></div>
      </div>

      <div className="card" style={{ marginTop: '1.5rem' }}>
        <h2>Recent Runs</h2>
        <table>
          <thead>
            <tr>
              <th>Module</th>
              <th>Portal</th>
              <th>Status</th>
              <th>Rows</th>
              <th>Started</th>
            </tr>
          </thead>
          <tbody>
            {recentRuns.map((r) => (
              <tr key={r.id}>
                <td>{r.moduleKey}</td>
                <td>{r.portal}{r.bpCode ? ` (${r.bpCode})` : ''}</td>
                <td className={`status-${r.status}`}>{r.status}</td>
                <td>{r.rowCount}</td>
                <td>{r.startedAt?.toLocaleString() ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
