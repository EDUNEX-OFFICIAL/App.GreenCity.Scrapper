import { getPrisma } from '@greencity/db';
import { getModuleConfig } from '@greencity/shared';
import { ExportButton } from '@/components/ExportButton';

export const dynamic = 'force-dynamic';

export default async function DataBrowserPage({
  params,
  searchParams,
}: {
  params: Promise<{ moduleKey: string }>;
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  const { moduleKey } = await params;
  const { page: pageStr, q } = await searchParams;
  const page = Math.max(1, Number.parseInt(pageStr ?? '1', 10));
  const pageSize = 50;
  const prisma = getPrisma();
  const config = getModuleConfig(moduleKey);

  const [rows, total] = await Promise.all([
    prisma.rawModuleRow.findMany({
      where: { moduleKey },
      orderBy: { lastSeenAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.rawModuleRow.count({ where: { moduleKey } }),
  ]);

  const filtered = q
    ? rows.filter((r) => JSON.stringify(r.rowJson).toLowerCase().includes(q.toLowerCase()))
    : rows;

  const headers = filtered.length > 0
    ? Object.keys(filtered[0].rowJson as Record<string, string>)
    : [];

  return (
    <div>
      <h1>{config?.label ?? moduleKey}</h1>
      <p>
        {total} rows total · page {page}
        {total > 0 && (
          <>
            {' '}
            · <ExportButton href={`/api/data/${moduleKey}/export`} />
          </>
        )}
      </p>
      <form style={{ margin: '1rem 0' }}>
        <input name="q" placeholder="Search JSON…" defaultValue={q} />
        <button className="btn" type="submit">Search</button>
      </form>
      <table>
        <thead>
          <tr>
            {headers.map((h) => <th key={h}>{h}</th>)}
            <th>Last Seen</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((r) => {
            const data = r.rowJson as Record<string, string>;
            return (
              <tr key={r.id}>
                {headers.map((h) => <td key={h}>{data[h] ?? ''}</td>)}
                <td>{r.lastSeenAt.toLocaleString()}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div style={{ marginTop: '1rem' }}>
        {page > 1 && <a href={`/data/${moduleKey}?page=${page - 1}`}>← Prev</a>}
        {page * pageSize < total && (
          <a href={`/data/${moduleKey}?page=${page + 1}`} style={{ marginLeft: '1rem' }}>Next →</a>
        )}
      </div>
    </div>
  );
}
