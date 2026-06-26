import { getAllAdminModules } from '@greencity/shared';
import { getAllModuleRowCounts, getGenealogyDataCounts } from '@greencity/db';

export const dynamic = 'force-dynamic';

export default async function DataIndexPage() {
  const modules = getAllAdminModules();
  const [rowCounts, genealogy] = await Promise.all([
    getAllModuleRowCounts(),
    getGenealogyDataCounts(),
  ]);

  return (
    <div className="data-index">
      <h1>Data</h1>
      <div className="data-index-grid">
        <a className="data-index-card" href="/data/genealogy">
          <strong>Genealogy</strong>
          <span>{genealogy.nodes.toLocaleString('en-IN')} nodes</span>
          <small>{genealogy.edges.toLocaleString('en-IN')} edges</small>
        </a>
        {modules.map((m) => {
          const count = rowCounts[m.key] ?? 0;
          return (
            <a key={m.key} className="data-index-card" href={`/data/${m.key}`}>
              <strong>{m.label}</strong>
              <span>{count.toLocaleString('en-IN')} rows</span>
              <small>{m.key}</small>
            </a>
          );
        })}
      </div>
    </div>
  );
}
