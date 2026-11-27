'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Lang } from '@/lib/types';
import { getDict } from '@/lib/i18n';
import {
  buildDecisionOutcome,
  computeWeightedTotal,
  evaluateEventRules,
  KEYWORD_CATEGORIES,
  KEYWORD_PRESETS,
  loadDecision,
  loadKeywordPrefs,
  loadReflection,
  saveDecision,
  saveKeywordPrefs,
  saveReflection,
  setEventAttended,
  WEIGHTS,
  type DecisionRecord,
  type DecisionVerdict,
  type DimensionKey,
  type DimensionScores,
  type EnergyLevel,
  type EventEvalContext,
  type FinalChoice,
  type ReflectionRecord,
} from '@/lib/go-decision';

export type DrawerMode = 'decide' | 'reflect';

interface GoNoGoDrawerProps {
  open: boolean;
  onClose: () => void;
  event: EventEvalContext;
  lang: Lang;
  initialMode?: DrawerMode;
}

const DIMENSIONS: DimensionKey[] = ['learning', 'networking', 'career'];

function bandKey(score: number): 'low' | 'mid' | 'good' | 'high' {
  if (score < 40) return 'low';
  if (score < 65) return 'mid';
  if (score < 80) return 'good';
  return 'high';
}

function HairlineCoin({
  verdict,
  label,
  flipping,
  revealed,
}: {
  verdict: DecisionVerdict;
  label: string;
  flipping: boolean;
  revealed: boolean;
}) {
  const isGo = verdict === 'go';
  const isEdge = verdict === 'edge';
  const ringClass = !revealed
    ? 'coin-face--idle'
    : isGo
      ? 'coin-face--go'
      : isEdge
        ? 'coin-face--edge'
        : 'coin-face--not-go';

  return (
    <div className="coin-stage" aria-hidden="true">
      <div className={`coin-body ${flipping ? 'coin-body--flipping' : revealed ? `coin-body--settled-${verdict}` : ''}`}>
        <div className={`coin-face ${ringClass}`}>
          <svg viewBox="0 0 120 120" className="h-[116px] w-[116px]" fill="none">
            {/* Outer hairline double ring */}
            <circle cx="60" cy="60" r="56" stroke="currentColor" strokeWidth="1" strokeOpacity="0.9" />
            <circle cx="60" cy="60" r="50" stroke="currentColor" strokeWidth="0.75" strokeDasharray="2 3" strokeOpacity="0.55" />
            {/* Cardinal hairline ticks */}
            <line x1="60" y1="4" x2="60" y2="11" stroke="currentColor" strokeWidth="1" />
            <line x1="60" y1="109" x2="60" y2="116" stroke="currentColor" strokeWidth="1" />
            <line x1="4" y1="60" x2="11" y2="60" stroke="currentColor" strokeWidth="1" />
            <line x1="109" y1="60" x2="116" y2="60" stroke="currentColor" strokeWidth="1" />

            {/* Geometric motif by state */}
            {!revealed && (
              <>
                <circle cx="60" cy="48" r="14" stroke="currentColor" strokeWidth="1" />
                <line x1="60" y1="30" x2="60" y2="66" stroke="currentColor" strokeWidth="0.9" />
                <line x1="42" y1="48" x2="78" y2="48" stroke="currentColor" strokeWidth="0.9" />
                <polygon points="60,38 66,48 60,58 54,48" stroke="#1257FD" strokeWidth="1" fill="none" />
              </>
            )}

            {revealed && isGo && (
              <>
                {/* Directional compass arrow + starburst in brand blue */}
                <circle cx="60" cy="46" r="16" stroke="#1257FD" strokeWidth="1" strokeOpacity="0.35" />
                <path d="M51 55L69 37" stroke="#1257FD" strokeWidth="1.4" strokeLinecap="round" />
                <path d="M56 37H69V50" stroke="#1257FD" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                <line x1="60" y1="24" x2="60" y2="28" stroke="#1257FD" strokeWidth="1" />
                <line x1="80" y1="46" x2="84" y2="46" stroke="#1257FD" strokeWidth="1" />
                <line x1="36" y1="46" x2="40" y2="46" stroke="#1257FD" strokeWidth="1" />
              </>
            )}

            {revealed && isEdge && (
              <>
                {/* Coin balanced vertically on its hairline edge: black left, blue right */}
                <line x1="60" y1="24" x2="60" y2="65" stroke="#1257FD" strokeWidth="1.4" />
                <ellipse cx="60" cy="44" rx="5" ry="18" stroke="currentColor" strokeWidth="1" />
                <line x1="38" y1="65" x2="82" y2="65" stroke="currentColor" strokeWidth="1" />
                <polygon points="60,65 55,71 65,71" stroke="currentColor" strokeWidth="0.9" fill="none" />
              </>
            )}

            {revealed && !isGo && !isEdge && (
              <>
                {/* Calm monochrome pause / horizon line */}
                <circle cx="60" cy="46" r="15" stroke="currentColor" strokeWidth="1" strokeOpacity="0.4" />
                <line x1="54" y1="38" x2="54" y2="54" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                <line x1="66" y1="38" x2="66" y2="54" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                <line x1="38" y1="64" x2="82" y2="64" stroke="currentColor" strokeWidth="0.8" strokeDasharray="2 2" strokeOpacity="0.6" />
              </>
            )}

            {/* Coin text label */}
            <text
              x="60"
              y="88"
              textAnchor="middle"
              fill={revealed && isGo ? '#1257FD' : 'currentColor'}
              fontSize="11"
              fontWeight="600"
              letterSpacing="0.14em"
            >
              {label}
            </text>
          </svg>
        </div>
      </div>
    </div>
  );
}

export default function GoNoGoDrawer({
  open,
  onClose,
  event,
  lang,
  initialMode = 'decide',
}: GoNoGoDrawerProps) {
  const dict = getDict(lang);
  const t = dict.gonogo;
  const dialogRef = useRef<HTMLDivElement>(null);
  const flipTimerRef = useRef<number | null>(null);

  const [mounted, setMounted] = useState(false);
  const [mode, setMode] = useState<DrawerMode>(initialMode);
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1 state
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [customKeywords, setCustomKeywords] = useState<string[]>([]);
  const [customInput, setCustomInput] = useState('');

  // Step 2 state (overrides on top of rule-suggested scores)
  const [overrides, setOverrides] = useState<Partial<DimensionScores>>({});

  // Step 3 state
  const [flipping, setFlipping] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [finalChoice, setFinalChoice] = useState<FinalChoice>(null);
  const [attended, setAttended] = useState(false);

  // Reflection state
  const [takeaway, setTakeaway] = useState('');
  const [connection, setConnection] = useState('');
  const [followUp, setFollowUp] = useState('');
  const [energy, setEnergy] = useState<EnergyLevel | undefined>(undefined);
  const [actualHours, setActualHours] = useState('');
  const [reflectionSaved, setReflectionSaved] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Hydrate from LocalStorage whenever drawer opens for an event
  useEffect(() => {
    if (!open) return;

    const prefs = loadKeywordPrefs();
    setSelectedIds(prefs.selectedIds);
    setCustomKeywords(prefs.customKeywords);
    setCustomInput('');
    setMode(initialMode);

    const existingDecision = loadDecision(event.id);
    if (existingDecision) {
      setOverrides(existingDecision.scores);
      setFinalChoice(existingDecision.finalChoice);
      setAttended(existingDecision.attended);
      setRevealed(true);
      setStep(initialMode === 'decide' ? 1 : 1);
    } else {
      setOverrides({});
      setFinalChoice(null);
      setAttended(false);
      setRevealed(false);
      setStep(1);
    }
    setFlipping(false);

    const existingRef = loadReflection(event.id);
    setTakeaway(existingRef?.takeaway ?? '');
    setConnection(existingRef?.connection ?? '');
    setFollowUp(existingRef?.followUp ?? '');
    setEnergy(existingRef?.energy);
    setActualHours(existingRef?.actualHours ?? '');
    setReflectionSaved(false);
  }, [open, event.id, initialMode]);

  // Escape key & scroll lock & focus management
  useEffect(() => {
    if (!open) return;
    const prevActive = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    dialogRef.current?.focus();

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
      if (flipTimerRef.current != null) window.clearTimeout(flipTimerRef.current);
      prevActive?.focus?.();
    };
  }, [open, onClose]);

  const ruleEval = useMemo(
    () => evaluateEventRules(event, selectedIds, customKeywords, lang),
    [event, selectedIds, customKeywords, lang],
  );

  const scores: DimensionScores = useMemo(
    () => ({
      learning: overrides.learning ?? ruleEval.suggested.learning.score,
      networking: overrides.networking ?? ruleEval.suggested.networking.score,
      career: overrides.career ?? ruleEval.suggested.career.score,
    }),
    [overrides, ruleEval],
  );

  const weightedTotal = useMemo(() => computeWeightedTotal(scores), [scores]);
  const outcome = useMemo(
    () => buildDecisionOutcome(event, scores, ruleEval, lang),
    [event, scores, ruleEval, lang],
  );

  const persistDecision = useCallback(
    (nextChoice: FinalChoice, nextAttended = attended) => {
      const record: DecisionRecord = {
        eventId: event.id,
        eventTitle: event.title,
        scores,
        total: outcome.total,
        verdict: outcome.verdict,
        finalChoice: nextChoice,
        selectedKeywords: selectedIds,
        attended: nextAttended,
        updatedAt: new Date().toISOString(),
      };
      saveDecision(record);
    },
    [attended, event.id, event.title, outcome.total, outcome.verdict, scores, selectedIds],
  );

  const toggleKeyword = (id: string) => {
    const next = selectedIds.includes(id)
      ? selectedIds.filter((item) => item !== id)
      : [...selectedIds, id];
    setSelectedIds(next);
    saveKeywordPrefs({ selectedIds: next, customKeywords });
    // Re-open suggested scores on non-manually-adjusted dimensions automatically
    setOverrides({});
  };

  const addCustomKeyword = () => {
    const cleaned = customInput.trim().slice(0, 32);
    if (!cleaned) return;
    const token = `custom:${cleaned}`;
    const nextCustom = customKeywords.includes(cleaned) ? customKeywords : [cleaned, ...customKeywords].slice(0, 12);
    const nextSelected = selectedIds.includes(token) ? selectedIds : [...selectedIds, token];
    setCustomKeywords(nextCustom);
    setSelectedIds(nextSelected);
    setCustomInput('');
    saveKeywordPrefs({ selectedIds: nextSelected, customKeywords: nextCustom });
    setOverrides({});
  };

  const removeCustomKeyword = (kw: string) => {
    const token = `custom:${kw}`;
    const nextCustom = customKeywords.filter((c) => c !== kw);
    const nextSelected = selectedIds.filter((id) => id !== token);
    setCustomKeywords(nextCustom);
    setSelectedIds(nextSelected);
    saveKeywordPrefs({ selectedIds: nextSelected, customKeywords: nextCustom });
  };

  const triggerCoinFlip = () => {
    if (flipTimerRef.current != null) window.clearTimeout(flipTimerRef.current);
    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduceMotion) {
      setFlipping(false);
      setRevealed(true);
      persistDecision(finalChoice);
      return;
    }

    setRevealed(false);
    setFlipping(true);
    flipTimerRef.current = window.setTimeout(() => {
      setFlipping(false);
      setRevealed(true);
      persistDecision(finalChoice);
    }, 1050);
  };

  const handleGoToStep3 = () => {
    setStep(3);
    triggerCoinFlip();
  };

  const handleFinalChoice = (choice: Exclude<FinalChoice, null>) => {
    const next = finalChoice === choice ? null : choice;
    setFinalChoice(next);
    persistDecision(next);
  };

  const handleToggleAttended = () => {
    const next = !attended;
    setAttended(next);
    setEventAttended(event.id, event.title, next);
  };

  const handleSaveReflection = (e: React.FormEvent) => {
    e.preventDefault();
    const record: ReflectionRecord = {
      eventId: event.id,
      takeaway: takeaway.trim(),
      connection: connection.trim(),
      followUp: followUp.trim(),
      energy,
      actualHours: actualHours.trim() || undefined,
      updatedAt: new Date().toISOString(),
    };
    saveReflection(record);
    if (!attended) {
      setAttended(true);
      setEventAttended(event.id, event.title, true);
    }
    setReflectionSaved(true);
  };

  if (!open || !mounted) return null;

  const relevantSet = new Set(ruleEval.relevantPresetIds);
  const relevantCustomSet = new Set(ruleEval.relevantCustomKeywords);
  const verdictCopy = t.verdicts[outcome.verdict];

  const drawerContent = (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 backdrop-blur-[1px] sm:items-stretch sm:justify-end"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="gonogo-drawer-title"
        className="gonogo-sheet flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-[var(--border)] bg-white shadow-2xl outline-none sm:max-h-none sm:h-full sm:max-w-[520px] sm:rounded-none sm:border-y-0 sm:border-r-0"
      >
        {/* Top bar */}
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-[var(--border)] text-[var(--primary)]" aria-hidden="true">
                <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none">
                  <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.2" />
                  <circle cx="8" cy="8" r="2" fill="currentColor" />
                </svg>
              </span>
              <h2 id="gonogo-drawer-title" className="text-[15px] font-semibold tracking-tight">
                {mode === 'decide' ? t.drawerTitle : t.reflectionTitle}
              </h2>
            </div>
            <p className="mt-0.5 text-xs text-muted">
              {mode === 'decide' ? t.drawerSubtitle : t.reflectionSubtitle}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            {mode === 'decide' ? (
              <button
                type="button"
                onClick={() => setMode('reflect')}
                className="btn btn-sm text-xs"
              >
                {t.reflectBtn}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setMode('decide')}
                className="btn btn-sm text-xs"
              >
                {t.backToDecision}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label={t.close}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--border)] text-muted transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
            >
              <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </header>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* Auto-inherited event context summary */}
          <section className="rounded-lg border border-[var(--border)] bg-[#fafafa] p-3.5">
            <h3 className="text-sm font-semibold leading-snug text-[var(--foreground)]">{event.title}</h3>
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
              <span className="tabular-nums">{event.whenLabel}</span>
              <span>·</span>
              <span>{event.isOnline ? t.contextOnline : event.venue}</span>
              {!event.isOnline && event.mrtName && event.mrtWalkMins != null && event.mrtWalkMins <= 15 && (
                <>
                  <span>·</span>
                  <span>{dict.events.walk(event.mrtName, event.mrtWalkMins)}</span>
                </>
              )}
            </div>
            {(event.organiser || event.tags.length > 0 || event.hiringCompanies.length > 0) && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {event.organiser && <span className="badge">{dict.events.by} {event.organiser}</span>}
                {event.hiringCompanies.map((c) => (
                  <span key={c.id} className="badge badge-primary">
                    {t.contextHiring(c.name, c.openRoles)}
                  </span>
                ))}
                {event.tags.slice(0, 4).map((tag) => (
                  <span key={tag} className="badge badge-muted">{tag}</span>
                ))}
              </div>
            )}
          </section>

          {mode === 'decide' ? (
            <>
              {/* Step stepper */}
              <nav aria-label={t.drawerTitle} className="mt-4 grid grid-cols-3 gap-1.5 rounded-lg bg-[var(--muted)] p-1">
                {([1, 2, 3] as const).map((s) => {
                  const active = step === s;
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => {
                        setStep(s);
                        if (s === 3 && !revealed && !flipping) triggerCoinFlip();
                      }}
                      className={`rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                        active
                          ? 'bg-white text-[var(--foreground)] shadow-sm'
                          : 'text-muted hover:text-[var(--foreground)]'
                      }`}
                      aria-current={active ? 'step' : undefined}
                    >
                      <span className="mr-1 tabular-nums opacity-60">{s}.</span>
                      {t.steps[s]}
                    </button>
                  );
                })}
              </nav>

              {/* STEP 1: Keywords */}
              {step === 1 && (
                <div className="mt-5 space-y-4">
                  <div className="flex items-baseline justify-between gap-2">
                    <div>
                      <h3 className="text-[15px] font-semibold">{t.step1Title}</h3>
                      <p className="mt-0.5 text-xs text-muted">{t.step1Hint}</p>
                    </div>
                    <span className="shrink-0 text-xs font-medium tabular-nums text-[var(--primary)]">
                      {t.selectedCount(selectedIds.length)}
                    </span>
                  </div>

                  {/* Priority highlight strip for keywords matching this event */}
                  <div className="rounded-lg border border-[var(--border)] bg-white p-3">
                    <p className="text-xs font-medium text-[var(--primary)]">{t.relevantStrip}</p>
                    {ruleEval.relevantPresetIds.length === 0 && ruleEval.relevantCustomKeywords.length === 0 ? (
                      <p className="mt-1 text-xs text-muted">{t.noRelevantYet}</p>
                    ) : (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {ruleEval.relevantPresetIds.map((id) => {
                          const selected = selectedIds.includes(id);
                          return (
                            <button
                              key={id}
                              type="button"
                              aria-pressed={selected}
                              onClick={() => toggleKeyword(id)}
                              className={`kw-chip kw-chip--relevant ${selected ? 'kw-chip--selected' : ''}`}
                            >
                              <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
                              {t.keywords[id] ?? id}
                            </button>
                          );
                        })}
                        {ruleEval.relevantCustomKeywords.map((kw) => {
                          const token = `custom:${kw}`;
                          const selected = selectedIds.includes(token);
                          return (
                            <button
                              key={token}
                              type="button"
                              aria-pressed={selected}
                              onClick={() => toggleKeyword(token)}
                              className={`kw-chip kw-chip--relevant ${selected ? 'kw-chip--selected' : ''}`}
                            >
                              <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
                              {kw}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* 4 Preset Categories */}
                  <div className="space-y-3.5">
                    {KEYWORD_CATEGORIES.map((cat) => {
                      const items = KEYWORD_PRESETS
                        .filter((k) => k.category === cat)
                        .sort((a, b) => Number(relevantSet.has(b.id)) - Number(relevantSet.has(a.id)));
                      return (
                        <div key={cat}>
                          <p className="mb-1.5 text-xs font-medium text-muted">{t.categories[cat]}</p>
                          <div className="flex flex-wrap gap-1.5">
                            {items.map((item) => {
                              const selected = selectedIds.includes(item.id);
                              const relevant = relevantSet.has(item.id);
                              return (
                                <button
                                  key={item.id}
                                  type="button"
                                  aria-pressed={selected}
                                  onClick={() => toggleKeyword(item.id)}
                                  className={`kw-chip ${relevant ? 'kw-chip--relevant' : ''} ${selected ? 'kw-chip--selected' : ''}`}
                                >
                                  {relevant && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />}
                                  {t.keywords[item.id] ?? item.id}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Custom keywords */}
                  <div className="border-t border-[var(--border)] pt-3.5">
                    <p className="mb-1.5 text-xs font-medium text-muted">{t.customSection}</p>
                    <form
                      className="flex gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        addCustomKeyword();
                      }}
                    >
                      <input
                        type="text"
                        value={customInput}
                        onChange={(e) => setCustomInput(e.target.value)}
                        placeholder={t.customPlaceholder}
                        className="input h-8 text-xs"
                        maxLength={32}
                      />
                      <button type="submit" className="btn btn-sm shrink-0">
                        {t.customAdd}
                      </button>
                    </form>
                    {customKeywords.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {customKeywords.map((kw) => {
                          const token = `custom:${kw}`;
                          const selected = selectedIds.includes(token);
                          const relevant = relevantCustomSet.has(kw);
                          return (
                            <span
                              key={kw}
                              className={`inline-flex items-center rounded-full border text-xs transition-colors ${
                                selected
                                  ? 'border-[var(--primary)] bg-[var(--primary)] text-white'
                                  : relevant
                                    ? 'border-[#b8cefe] bg-[var(--primary-soft)] text-[var(--primary)]'
                                    : 'border-[var(--border)] bg-white text-[var(--foreground)]'
                              }`}
                            >
                              <button
                                type="button"
                                aria-pressed={selected}
                                onClick={() => toggleKeyword(token)}
                                className="px-2.5 py-1 text-xs font-medium"
                              >
                                {kw}
                              </button>
                              <button
                                type="button"
                                aria-label={`${t.close} ${kw}`}
                                onClick={() => removeCustomKeyword(kw)}
                                className="pr-2 text-[11px] opacity-70 hover:opacity-100"
                              >
                                ×
                              </button>
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* STEP 2: 3 Dimensions */}
              {step === 2 && (
                <div className="mt-5 space-y-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div>
                      <h3 className="text-[15px] font-semibold">{t.step2Title}</h3>
                      <p className="mt-0.5 text-xs text-muted">{t.step2Hint}</p>
                    </div>
                    <span className="badge badge-primary tabular-nums">{t.weightedPreview(weightedTotal)}</span>
                  </div>

                  {DIMENSIONS.map((key) => {
                    const dimCopy = t.dimensions[key];
                    const est = ruleEval.suggested[key];
                    const value = scores[key];
                    const isOverridden = overrides[key] !== undefined && overrides[key] !== est.score;
                    const weightPct = Math.round(WEIGHTS[key] * 100);
                    const b = bandKey(value);

                    return (
                      <div key={key} className="rounded-lg border border-[var(--border)] bg-white p-3.5">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold">{dimCopy.name}</span>
                            <span className="badge badge-muted tabular-nums">{t.weightLabel(weightPct)}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {isOverridden ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setOverrides((prev) => ({ ...prev, [key]: undefined }));
                                  setRevealed(false);
                                }}
                                className="text-[11px] text-[var(--primary)] hover:underline"
                              >
                                {t.resetSuggested} ({est.score})
                              </button>
                            ) : (
                              <span className="text-[11px] text-muted tabular-nums">{t.suggestedTag(est.score)}</span>
                            )}
                            <span className="min-w-[2.2rem] text-right text-base font-semibold tabular-nums text-[var(--foreground)]">
                              {value}
                            </span>
                          </div>
                        </div>

                        <p className="mt-1 text-xs text-[var(--foreground)]">{dimCopy.question}</p>

                        {/* Slider */}
                        <div className="mt-3">
                          <input
                            type="range"
                            min={0}
                            max={100}
                            step={1}
                            value={value}
                            aria-label={`${dimCopy.name} (${t.weightLabel(weightPct)})`}
                            onChange={(e) => {
                              const next = Number(e.target.value);
                              setOverrides((prev) => ({ ...prev, [key]: next }));
                              setRevealed(false);
                            }}
                            className="gonogo-slider w-full"
                          />
                          <div className="mt-1 flex justify-between gap-3 text-[11px] text-muted">
                            <span>0 · {dimCopy.lowLabel}</span>
                            <span className="text-right">100 · {dimCopy.highLabel}</span>
                          </div>
                        </div>

                        {/* Dynamic live interpretation */}
                        <p className="mt-2.5 rounded-md bg-[var(--muted)] px-2.5 py-1.5 text-xs leading-relaxed text-[var(--foreground)]">
                          {dimCopy.bands[b]}
                        </p>

                        {/* Transparent rule reasons & honest low-info notice */}
                        {(est.reasons.length > 0 || est.infoNotice) && (
                          <ul className="mt-2 space-y-1 text-[11px] leading-relaxed text-muted">
                            {est.reasons.map((reason) => (
                              <li key={reason} className="flex gap-1.5">
                                <span aria-hidden="true">•</span>
                                <span>{reason}</span>
                              </li>
                            ))}
                            {est.infoNotice && (
                              <li className="flex gap-1.5 text-[#525252]">
                                <span aria-hidden="true">ⓘ</span>
                                <span>{est.infoNotice}</span>
                              </li>
                            )}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* STEP 3: Flip the Coin */}
              {step === 3 && (
                <div className="mt-5 space-y-4">
                  {/* Coin stage */}
                  <div className="flex flex-col items-center rounded-xl border border-[var(--border)] bg-[#fafafa] px-4 py-5 text-center">
                    <button
                      type="button"
                      onClick={triggerCoinFlip}
                      disabled={flipping}
                      className="group rounded-full"
                      aria-label={t.flipBtn}
                    >
                      <HairlineCoin
                        verdict={outcome.verdict}
                        label={revealed ? verdictCopy.coinLabel : '· · ·'}
                        flipping={flipping}
                        revealed={revealed}
                      />
                    </button>

                    <div className="mt-3">
                      {flipping ? (
                        <p className="text-xs font-medium text-muted">{t.flipping}</p>
                      ) : revealed ? (
                        <>
                          <div className="flex items-center justify-center gap-2">
                            <span
                              className={`badge ${
                                outcome.verdict === 'go'
                                  ? 'badge-primary'
                                  : outcome.verdict === 'edge'
                                    ? 'border-[#b8cefe] text-[var(--foreground)]'
                                    : 'badge-muted'
                              }`}
                            >
                              {verdictCopy.badge}
                            </span>
                            <span className="text-sm font-semibold tabular-nums">
                              {outcome.total} / 100
                            </span>
                          </div>
                          <h3 className="mt-2 text-base font-semibold tracking-tight">{verdictCopy.headline}</h3>
                          <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted">{verdictCopy.summary}</p>
                        </>
                      ) : (
                        <button type="button" onClick={triggerCoinFlip} className="btn btn-primary">
                          {t.flipBtn}
                        </button>
                      )}
                    </div>

                    <p className="mt-3 text-[11px] text-muted">{t.deterministicNote}</p>
                  </div>

                  {/* Result details (visible once revealed) */}
                  {revealed && !flipping && (
                    <>
                      {/* 3-dimension visual summary */}
                      <div className="rounded-lg border border-[var(--border)] bg-white p-3.5">
                        <div className="grid grid-cols-3 gap-3">
                          {DIMENSIONS.map((key) => {
                            const score = scores[key];
                            const pct = Math.round(WEIGHTS[key] * 100);
                            return (
                              <div key={key}>
                                <div className="flex items-baseline justify-between gap-1 text-xs">
                                  <span className="truncate font-medium">{t.dimensions[key].name}</span>
                                  <span className="tabular-nums text-muted">{pct}%</span>
                                </div>
                                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--muted)]">
                                  <div
                                    className="h-full rounded-full bg-[var(--primary)]"
                                    style={{ width: `${score}%`, opacity: key === 'learning' ? 1 : key === 'career' ? 0.8 : 0.6 }}
                                  />
                                </div>
                                <p className="mt-1 text-xs font-semibold tabular-nums">{score}</p>
                              </div>
                            );
                          })}
                        </div>
                        <p className="mt-3 border-t border-[var(--border)] pt-2.5 text-xs leading-relaxed text-[var(--foreground)]">
                          {outcome.rationale}
                        </p>
                      </div>

                      {/* Time commitment */}
                      <div className="flex items-start justify-between gap-3 rounded-lg border border-[var(--border)] bg-white px-3.5 py-2.5 text-xs">
                        <span className="font-medium text-muted">{t.timeTitle}</span>
                        <span className="text-right font-medium text-[var(--foreground)] tabular-nums">
                          {t.timeFormat(
                            String(outcome.time.totalHours),
                            String(outcome.time.eventHours),
                            String(outcome.time.commuteHours),
                            event.isOnline,
                            outcome.time.isEstimatedDuration,
                          )}
                        </span>
                      </div>

                      {/* Reflective Question (First Principles / Socratic / DYL) */}
                      <div className="rounded-lg border border-[var(--border)] bg-[#fafafa] p-3.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-medium text-muted">{t.promptTitle}</span>
                          <span className="badge">{t.frameworks[outcome.prompt.framework]}</span>
                        </div>
                        <p className="mt-2 text-[13px] font-medium leading-relaxed text-[var(--foreground)]">
                          “{outcome.prompt.question}”
                        </p>
                      </div>

                      {/* User final decision + registration */}
                      <div className="rounded-lg border border-[var(--border)] bg-white p-3.5">
                        <p className="text-xs text-muted">{t.finalCallNote}</p>
                        <div className="mt-2.5 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => handleFinalChoice('go')}
                            aria-pressed={finalChoice === 'go'}
                            className={`btn btn-sm flex-1 ${finalChoice === 'go' ? 'btn-primary' : ''}`}
                          >
                            {finalChoice === 'go' ? `✓ ${t.chosenGoBadge}` : t.chooseGo}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleFinalChoice('skip')}
                            aria-pressed={finalChoice === 'skip'}
                            className={`btn btn-sm flex-1 ${
                              finalChoice === 'skip' ? '!border-[var(--foreground)] !bg-[var(--foreground)] !text-white' : ''
                            }`}
                          >
                            {finalChoice === 'skip' ? `✓ ${t.chosenSkipBadge}` : t.chooseSkip}
                          </button>
                        </div>
                        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] pt-2.5 text-xs">
                          <button
                            type="button"
                            onClick={handleToggleAttended}
                            className="text-muted underline-offset-2 hover:text-[var(--foreground)] hover:underline"
                          >
                            {attended ? `✓ ${t.attendedBadge}` : t.markAttended}
                          </button>
                          <a
                            href={event.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="link font-medium"
                          >
                            {t.openOfficial} ↗
                          </a>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </>
          ) : (
            /* REFLECTION MODE (3 questions + optional energy & actual time) */
            <form onSubmit={handleSaveReflection} className="mt-4 space-y-4">
              <div>
                <label htmlFor="ref-takeaway" className="block text-xs font-medium text-[var(--foreground)]">
                  {t.qTakeaway}
                </label>
                <textarea
                  id="ref-takeaway"
                  rows={3}
                  value={takeaway}
                  onChange={(e) => {
                    setTakeaway(e.target.value);
                    setReflectionSaved(false);
                  }}
                  placeholder={t.qTakeawayPlaceholder}
                  className="input mt-1.5 h-auto py-2 text-[13px] leading-relaxed"
                />
              </div>

              <div>
                <label htmlFor="ref-connection" className="block text-xs font-medium text-[var(--foreground)]">
                  {t.qConnection}
                </label>
                <textarea
                  id="ref-connection"
                  rows={3}
                  value={connection}
                  onChange={(e) => {
                    setConnection(e.target.value);
                    setReflectionSaved(false);
                  }}
                  placeholder={t.qConnectionPlaceholder}
                  className="input mt-1.5 h-auto py-2 text-[13px] leading-relaxed"
                />
              </div>

              <div>
                <label htmlFor="ref-followup" className="block text-xs font-medium text-[var(--foreground)]">
                  {t.qFollowUp}
                </label>
                <textarea
                  id="ref-followup"
                  rows={2}
                  value={followUp}
                  onChange={(e) => {
                    setFollowUp(e.target.value);
                    setReflectionSaved(false);
                  }}
                  placeholder={t.qFollowUpPlaceholder}
                  className="input mt-1.5 h-auto py-2 text-[13px] leading-relaxed"
                />
              </div>

              {/* Optional Energy Level */}
              <div>
                <p className="text-xs font-medium text-muted">{t.energyLabel}</p>
                <div className="mt-1.5 grid grid-cols-3 gap-2">
                  {(['drained', 'neutral', 'energized'] as const).map((lvl) => {
                    const active = energy === lvl;
                    return (
                      <button
                        key={lvl}
                        type="button"
                        aria-pressed={active}
                        onClick={() => {
                          setEnergy(active ? undefined : lvl);
                          setReflectionSaved(false);
                        }}
                        className={`btn btn-sm text-xs ${
                          active
                            ? lvl === 'energized'
                              ? 'btn-primary'
                              : '!border-[var(--foreground)] !bg-[var(--foreground)] !text-white'
                            : ''
                        }`}
                      >
                        {t.energy[lvl]}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Optional Actual Time */}
              <div>
                <label htmlFor="ref-time" className="block text-xs font-medium text-muted">
                  {t.actualTimeLabel}
                </label>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {t.actualTimePresets.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => {
                        setActualHours(preset);
                        setReflectionSaved(false);
                      }}
                      className={`kw-chip ${actualHours === preset ? 'kw-chip--selected' : ''}`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
                <input
                  id="ref-time"
                  type="text"
                  value={actualHours}
                  onChange={(e) => {
                    setActualHours(e.target.value);
                    setReflectionSaved(false);
                  }}
                  placeholder={t.actualTimePlaceholder}
                  className="input mt-2 h-8 text-xs"
                  maxLength={30}
                />
              </div>

              <div className="flex items-center justify-between gap-3 pt-1">
                <span className="text-xs text-[var(--primary)]">
                  {reflectionSaved ? `✓ ${t.savedReflection}` : ''}
                </span>
                <button type="submit" className="btn btn-primary">
                  {t.saveReflection}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Sticky footer for 3-step decision navigation */}
        {mode === 'decide' && (
          <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-[var(--border)] bg-white px-5 py-3">
            {step > 1 ? (
              <button
                type="button"
                onClick={() => setStep((s) => (s === 3 ? 2 : 1))}
                className="btn btn-sm"
              >
                ← {t.back}
              </button>
            ) : (
              <span className="text-xs text-muted">{t.stepLabel(step, 3)}</span>
            )}

            {step === 1 && (
              <button type="button" onClick={() => setStep(2)} className="btn btn-primary btn-sm">
                {t.next}: {t.steps[2]} →
              </button>
            )}
            {step === 2 && (
              <button type="button" onClick={handleGoToStep3} className="btn btn-primary btn-sm">
                {t.flipBtn} →
              </button>
            )}
            {step === 3 && (
              <button type="button" onClick={triggerCoinFlip} disabled={flipping} className="btn btn-sm">
                {t.flipAgain}
              </button>
            )}
          </footer>
        )}
      </div>
    </div>
  );

  return createPortal(drawerContent, document.body);
}
