'use client';

import { ExportButton } from './ExportButton';

export function DataPageToolbar({
  title,
  subtitle,
  total,
  exportHref,
  exportLabel = 'Export CSV',
  extraExports,
  onDeleteAll,
  deleting,
  deleteLabel = 'Delete All Records',
}: {
  title: string;
  subtitle?: string;
  total: number;
  exportHref: string;
  exportLabel?: string;
  extraExports?: Array<{ href: string; label: string }>;
  onDeleteAll: () => void;
  deleting?: boolean;
  deleteLabel?: string;
}) {
  return (
    <div className="data-page-header">
      <div>
        <h1 className="data-page-title">{title}</h1>
        {subtitle && <p className="data-page-sub">{subtitle}</p>}
        <p className="data-page-count">
          <strong>{total.toLocaleString('en-IN')}</strong> records in database
        </p>
      </div>
      <div className="data-toolbar-actions">
        <ExportButton href={exportHref} label={exportLabel} />
        {extraExports?.map((e) => (
          <ExportButton key={e.href} href={e.href} label={e.label} small />
        ))}
        <button
          type="button"
          className="btn btn-danger"
          onClick={onDeleteAll}
          disabled={deleting || total === 0}
        >
          {deleting ? 'Deleting…' : deleteLabel}
        </button>
      </div>
    </div>
  );
}
