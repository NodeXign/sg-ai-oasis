'use client';

import { useEffect, useState } from 'react';
import type { Lang } from '@/lib/types';
import { getDict } from '@/lib/i18n';
import {
  GONOGO_STORAGE_EVENT,
  isEventEnded,
  loadDecision,
  loadReflection,
  setEventAttended,
  type DecisionRecord,
  type EventEvalContext,
  type ReflectionRecord,
} from '@/lib/go-decision';
import GoNoGoDrawer, { type DrawerMode } from './GoNoGoDrawer';

interface EventCardActionsProps {
  event: EventEvalContext;
  lang: Lang;
  registerLabel: string;
}

export default function EventCardActions({ event, lang, registerLabel }: EventCardActionsProps) {
  const t = getDict(lang).gonogo;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<DrawerMode>('decide');
  const [decision, setDecision] = useState<DecisionRecord | null>(null);
  const [reflection, setReflection] = useState<ReflectionRecord | null>(null);
  const [ended, setEnded] = useState(false);

  useEffect(() => {
    const sync = () => {
      setDecision(loadDecision(event.id));
      setReflection(loadReflection(event.id));
      setEnded(isEventEnded(event));
    };
    sync();
    window.addEventListener(GONOGO_STORAGE_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(GONOGO_STORAGE_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, [event]);

  const openMode = (m: DrawerMode) => {
    setDrawerMode(m);
    setDrawerOpen(true);
  };

  const hasReflectionContent = Boolean(
    reflection && (reflection.takeaway || reflection.connection || reflection.followUp || reflection.energy),
  );
  const showReflectionEntry = ended || Boolean(decision?.attended) || hasReflectionContent;
  const canMarkAttended = !showReflectionEntry && (decision?.finalChoice === 'go' || decision?.verdict === 'go');

  const verdictBadgeLabel = decision
    ? decision.finalChoice === 'go'
      ? t.chosenGoBadge
      : decision.finalChoice === 'skip'
        ? t.chosenSkipBadge
        : `${t.verdicts[decision.verdict].coinLabel} · ${decision.total}`
    : null;

  return (
    <div className="mt-auto space-y-2 pt-1">
      {/* Compact local decision / reflection status strip */}
      {(decision || hasReflectionContent) && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {decision && verdictBadgeLabel && (
            <button
              type="button"
              onClick={() => openMode('decide')}
              className={`badge cursor-pointer transition-colors hover:border-[var(--primary)] ${
                decision.finalChoice === 'go' || (!decision.finalChoice && decision.verdict === 'go')
                  ? 'badge-primary'
                  : 'badge-muted'
              }`}
            >
              {verdictBadgeLabel}
            </button>
          )}
          {decision?.attended && !hasReflectionContent && (
            <span className="badge">{t.attendedBadge}</span>
          )}
          {hasReflectionContent && (
            <button
              type="button"
              onClick={() => openMode('reflect')}
              className="badge cursor-pointer border-[#b8cefe] bg-[var(--primary-soft)] text-[var(--primary)]"
            >
              ✓ {t.reflectedBadge}
            </button>
          )}
        </div>
      )}

      {/* Primary actions */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => openMode('decide')}
          className="btn btn-sm flex-1"
        >
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0 text-[var(--primary)]" fill="none" aria-hidden="true">
            <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.2" />
            <circle cx="8" cy="8" r="2" fill="currentColor" />
          </svg>
          <span>{decision ? t.reEvaluate : t.evaluateShort}</span>
        </button>

        {showReflectionEntry ? (
          <button
            type="button"
            onClick={() => openMode('reflect')}
            className="btn btn-sm shrink-0"
          >
            {hasReflectionContent ? t.reflectedBadge : t.reflectBtn}
          </button>
        ) : (
          <a href={event.url} target="_blank" rel="noopener noreferrer" className="btn btn-sm flex-1">
            {registerLabel} <span aria-hidden>↗</span>
          </a>
        )}
      </div>

      {/* Secondary row when reflection replaces register slot, or quick mark-attended toggle */}
      {showReflectionEntry && (
        <a href={event.url} target="_blank" rel="noopener noreferrer" className="btn btn-sm w-full">
          {registerLabel} <span aria-hidden>↗</span>
        </a>
      )}

      {canMarkAttended && (
        <button
          type="button"
          onClick={() => {
            setEventAttended(event.id, event.title, true);
            openMode('reflect');
          }}
          className="w-full text-center text-xs text-muted underline-offset-2 transition-colors hover:text-[var(--foreground)] hover:underline"
        >
          {t.markAttended} → {t.reflectBtn}
        </button>
      )}

      <GoNoGoDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        event={event}
        lang={lang}
        initialMode={drawerMode}
      />
    </div>
  );
}
