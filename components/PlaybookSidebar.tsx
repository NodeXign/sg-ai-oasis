import type { SgEvent } from '@/lib/types';
import { buildCareerSignals, getCuratorTake, getEventType, getTopPicks } from '@/lib/event-insights';

interface Props {
  events: SgEvent[];
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-SG', {
    month: 'short',
    day: 'numeric',
    weekday: 'short',
    timeZone: 'Asia/Singapore',
  });
}

export default function PlaybookSidebar({ events }: Props) {
  const picks = getTopPicks(events, 4);
  const signals = buildCareerSignals(events);

  return (
    <aside className="space-y-4">
      <section className="playbook-panel p-5 space-y-4">
        <div>
          <p className="section-label">SG AI Oasis Playbook v2.0</p>
          <h1 className="text-2xl font-bold tracking-tight mt-1">新加坡 AI 活动机会地图</h1>
          <p className="text-sm text-[var(--muted)] leading-relaxed mt-2">
            我替你看完整个新加坡 AI 圈，再告诉你什么值得参加、能学到什么，以及它可能把你带向哪里。
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="metric-tile"><span>{events.length}</span><p>Upcoming events</p></div>
          <div className="metric-tile"><span>{events.filter((event) => event.isFree).length}</span><p>Free to attend</p></div>
        </div>
        <div className="flex flex-wrap gap-2">
          {['Learn AI', 'Find a Job', 'Meet Builders', 'Build Portfolio'].map((goal) => (
            <span key={goal} className="goal-chip">{goal}</span>
          ))}
        </div>
      </section>

      <section className="playbook-panel p-4 space-y-3">
        <p className="section-label">This Week's Best Picks</p>
        {picks.map((event) => (
          <a key={event.id} href={event.sourceUrl} target="_blank" rel="noopener noreferrer" className="block rounded-[8px] border border-[var(--border)] p-3 hover:border-[var(--accent)] hover:bg-[var(--ink-50)] transition-colors">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-[var(--accent)]">{getEventType(event)}</span>
              <span className="text-[10px] text-[var(--muted)] whitespace-nowrap">{formatDate(event.startAt)}</span>
            </div>
            <h2 className="text-sm font-semibold leading-snug mt-1 line-clamp-2">{event.title}</h2>
            <p className="text-[11px] text-[var(--muted)] leading-relaxed mt-1 line-clamp-2">{getCuratorTake(event)}</p>
          </a>
        ))}
      </section>

      <section className="playbook-panel p-4 space-y-3">
        <p className="section-label">AI Career Signals</p>
        <div className="grid grid-cols-2 gap-2">
          {signals.map((signal) => (
            <div key={signal.label} className="signal-tile">
              <span>{signal.value}</span>
              <p>{signal.label}</p>
            </div>
          ))}
        </div>
        <p className="text-[11px] leading-relaxed text-[var(--muted)]">
          本月信号不是“AI 很热”，而是：活动正在指向 agent workflow、hackathon portfolio 和 founder network。
        </p>
      </section>
    </aside>
  );
}
