import { getPrisma } from '@greencity/db';

export const dynamic = 'force-dynamic';

export default async function BackfillPage() {
  const prisma = getPrisma();
  const progress = await prisma.backfillProgress.findMany({ orderBy: { moduleKey: 'asc' } });

  return (
    <div>
      <h1>Backfill Progress</h1>
      <form action="/api/backfill/start" method="post" style={{ marginBottom: '1rem' }}>
        <button className="btn" type="submit">Start Full Backfill</button>
      </form>
      <table>
        <thead>
          <tr>
            <th>Module</th>
            <th>Portal</th>
            <th>Date Range</th>
            <th>Progress</th>
            <th>Status</th>
            <th>Cursor</th>
          </tr>
        </thead>
        <tbody>
          {progress.length === 0 && (
            <tr><td colSpan={6}>No backfill jobs yet.</td></tr>
          )}
          {progress.map((p) => (
            <tr key={p.id}>
              <td>{p.moduleKey}</td>
              <td>{p.portal}</td>
              <td>{p.dateFrom} → {p.dateTo}</td>
              <td>{p.completedChunks} / {p.totalChunks}</td>
              <td className={`status-${p.status}`}>{p.status}</td>
              <td>{p.currentCursor ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
