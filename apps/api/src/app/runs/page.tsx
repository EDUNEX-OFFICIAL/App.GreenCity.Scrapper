import { getPrisma } from '@greencity/db';

export const dynamic = 'force-dynamic';

export default async function RunsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; module?: string }>;
}) {
  const params = await searchParams;
  const prisma = getPrisma();
  const runs = await prisma.scrapeRun.findMany({
    where: {
      ...(params.status ? { status: params.status as never } : {}),
      ...(params.module ? { moduleKey: params.module } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  return (
    <div>
      <h1>Scrape Runs</h1>
      <table style={{ marginTop: '1rem' }}>
        <thead>
          <tr>
            <th>Module</th>
            <th>Portal</th>
            <th>Status</th>
            <th>Rows</th>
            <th>Inserted</th>
            <th>Updated</th>
            <th>Started</th>
            <th>Finished</th>
            <th>Error</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => (
            <tr key={r.id}>
              <td>{r.moduleKey}</td>
              <td>{r.portal}{r.bpCode ? ` / ${r.bpCode}` : ''}</td>
              <td className={`status-${r.status}`}>{r.status}</td>
              <td>{r.rowCount}</td>
              <td>{r.rowsInserted}</td>
              <td>{r.rowsUpdated}</td>
              <td>{r.startedAt?.toLocaleString() ?? '—'}</td>
              <td>{r.finishedAt?.toLocaleString() ?? '—'}</td>
              <td>{r.error ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
