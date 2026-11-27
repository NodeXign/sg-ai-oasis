import Link from 'next/link';
import type { Lang } from '@/lib/types';
import { getDict } from '@/lib/i18n';

type PageKey = 'home' | 'events' | 'jobs' | 'gonogo';
const PATH: Record<PageKey, string> = { home: '', events: '/events', jobs: '/jobs', gonogo: '/gonogo' };

export default function SiteHeader({ lang, active }: { lang: Lang; active: PageKey }) {
  const t = getDict(lang);
  const other: Lang = lang === 'zh' ? 'en' : 'zh';
  return (
    <header className="sticky top-0 z-[1000] border-b border-[var(--border)] bg-white/85 backdrop-blur">
      <div className="container-page flex h-14 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-4 sm:gap-6">
          <Link href={`/${lang}`} className="flex shrink-0 items-center gap-2 text-[15px] font-semibold tracking-tight">
            <span aria-hidden className="grid h-6 w-6 place-items-center rounded-md bg-[var(--primary)] text-[11px] font-bold text-white">SG</span>
            <span className="hidden sm:inline">AI Oasis</span>
          </Link>
          <nav className="flex items-center gap-0.5" aria-label="Main">
            {(Object.keys(PATH) as PageKey[]).map((key) => (
              <Link key={key} href={`/${lang}${PATH[key]}`} className="nav-link"
                    aria-current={key === active ? 'page' : undefined}>
                {t.nav[key]}
              </Link>
            ))}
          </nav>
        </div>
        <Link href={`/${other}${PATH[active]}`} className="btn btn-sm shrink-0" hrefLang={other}>
          {t.switchTo}
        </Link>
      </div>
    </header>
  );
}
