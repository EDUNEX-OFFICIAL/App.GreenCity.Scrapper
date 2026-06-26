'use client';

import { usePathname } from 'next/navigation';

type NavItem = { href: string; label: string };
type NavGroup = { title: string; items: NavItem[] };

const NAV: NavGroup[] = [
  {
    title: 'Dashboard',
    items: [
      { href: '/', label: 'Overview' },
      { href: '/live', label: 'Live' },
    ],
  },
  {
    title: 'Scraped Data',
    items: [
      { href: '/data', label: 'All Data' },
      { href: '/data/bp_list', label: 'BP List' },
      { href: '/data/genealogy', label: 'Genealogy' },
    ],
  },
  {
    title: 'Scrape',
    items: [
      { href: '/modules', label: 'Modules' },
      { href: '/runs', label: 'Run History' },
      { href: '/backfill', label: 'Backfill' },
    ],
  },
];

function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppSidebar() {
  const pathname = usePathname() ?? '/';

  return (
    <aside className="app-sidebar">
      <div className="sidebar-brand">
        <a href="/" className="sidebar-brand-link">
          <span className="sidebar-brand-title">Green City</span>
          <span className="sidebar-brand-sub">ERP Sync</span>
        </a>
      </div>
      <nav className="sidebar-nav">
        {NAV.map((group) => (
          <div key={group.title} className="sidebar-group">
            <p className="sidebar-group-title">{group.title}</p>
            <ul className="sidebar-list">
              {group.items.map((item) => (
                <li key={item.href}>
                  <a
                    href={item.href}
                    className={`sidebar-link${isActive(pathname, item.href) ? ' sidebar-link-active' : ''}`}
                  >
                    <span>{item.label}</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}
