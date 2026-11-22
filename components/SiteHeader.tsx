const TABS = [
  { href: '/',      key: 'week',  label: '机会地图' },
  { href: '/month', key: 'month', label: '30 天活动' },
  { href: '/jobs',  key: 'jobs',  label: '在招岗位' },
] as const;

export default function SiteHeader({
  active,
  note,
}: {
  active: (typeof TABS)[number]['key'];
  note?: string;
}) {
  return (
    <header className="sticky top-0 z-50 backdrop-blur-md border-b border-[var(--border)] bg-[var(--bg)]/90">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
        <a href="/" className="flex items-center gap-3 flex-shrink-0">
          <div className="w-7 h-7 rounded-[8px] bg-[var(--accent)] flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/>
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
            </svg>
          </div>
          <span className="font-bold text-[15px] tracking-tight hidden sm:block">SG AI Oasis</span>
        </a>

        <nav className="flex items-center gap-1 bg-[var(--ink-100)] p-1 rounded-[12px] overflow-x-auto" aria-label="Page">
          {TABS.map((t) => (
            <a
              key={t.key}
              href={t.href}
              aria-current={t.key === active ? 'page' : undefined}
              className={`page-nav-tab ${t.key === active ? 'page-nav-tab--active' : ''}`}
            >
              {t.label}
            </a>
          ))}
        </nav>

        <p className="text-[11px] text-[var(--muted)] hidden md:block flex-shrink-0">{note ?? ''}</p>
      </div>
    </header>
  );
}
