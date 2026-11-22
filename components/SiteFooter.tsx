import type { Lang } from '@/lib/types';
import { getDict } from '@/lib/i18n';

export default function SiteFooter({ lang }: { lang: Lang }) {
  const t = getDict(lang);
  return (
    <footer className="mt-24 border-t border-[var(--border)]">
      <div className="container-page flex flex-col gap-2 py-8 text-[13px] text-muted sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-xl space-y-1">
          <p>{t.footer.line}</p>
          <p>{t.footer.disclaimer}</p>
        </div>
        <a className="link shrink-0" href="https://github.com/Gukki2021/sg-ai-oasis" target="_blank" rel="noopener noreferrer">
          {t.footer.github}
        </a>
      </div>
    </footer>
  );
}
