'use client';

export function ExportButton({
  href,
  label = 'Export CSV',
  small,
}: {
  href: string;
  label?: string;
  small?: boolean;
}) {
  return (
    <a
      href={href}
      className={small ? 'btn btn-sm' : 'btn'}
      style={small ? { padding: '0.2rem 0.5rem', fontSize: '0.85rem' } : undefined}
      download
    >
      {label}
    </a>
  );
}
