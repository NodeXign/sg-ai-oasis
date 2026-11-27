'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Lang } from '@/lib/types';
import { getDict } from '@/lib/i18n';
import {
  estimateTimeCommitment,
  evaluateEventRules,
  getZhEventSummary,
  GONOGO_STORAGE_EVENT,
  isEventEnded,
  KEYWORD_CATEGORIES,
  KEYWORD_PRESETS,
  loadAllDecisions,
  loadAllReflections,
  loadKeywordPrefs,
  saveDecision,
  saveKeywordPrefs,
  saveReflection,
  setEventAttended,
  verdictFromScore,
  type DecisionRecord,
  type DecisionVerdict,
  type DimensionKey,
  type DimensionScores,
  type EnergyLevel,
  type EventEvalContext,
  type FinalChoice,
  type ReflectionRecord,
} from '@/lib/go-decision';

export interface StudioEventItem {
  shortDate: string;
  dayHeading: string;
  event: EventEvalContext;
}

const DIMENSIONS: DimensionKey[] = ['learning', 'networking', 'career'];
const RIM_SLICES = [-3, -2, -1, 0, 1, 2, 3];
const DEFAULT_RAW_WEIGHTS: Record<DimensionKey, number> = { learning: 50, networking: 15, career: 35 };

function normalizeWeights(raw: Record<DimensionKey, number>): Record<DimensionKey, number> {
  const sum = raw.learning + raw.networking + raw.career;
  if (sum <= 0) return { learning: 0.5, networking: 0.15, career: 0.35 };
  return {
    learning: raw.learning / sum,
    networking: raw.networking / sum,
    career: raw.career / sum,
  };
}

function clampScore(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function playCoinChime(kind: 'launch' | DecisionVerdict) {
  if (typeof window === 'undefined') return;
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    if (kind === 'launch') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1180, now);
      osc.frequency.exponentialRampToValueAtTime(2150, now + 0.08);
      gain.gain.setValueAtTime(0.04, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.15);
    } else {
      const freq = kind === 'go' ? 880 : kind === 'edge' ? 660 : 440;
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.exponentialRampToValueAtTime(kind === 'go' ? freq * 1.25 : freq, now + 0.12);
      gain.gain.setValueAtTime(0.045, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.26);
    }
    window.setTimeout(() => { ctx.close().catch(() => {}); }, 350);
  } catch {
    // Ignore audio errors
  }
}

export default function GoNoGoStudio({
  items,
  lang,
  initialEventId,
}: {
  items: StudioEventItem[];
  lang: Lang;
  initialEventId?: string;
}) {
  const dict = getDict(lang);
  const t = dict.gonogo;
  const st = t.studio;

  // Multi-select candidate event IDs on the left bookshelf
  const [pickedIds, setPickedIds] = useState<string[]>(() => {
    if (initialEventId && items.some((i) => i.event.id === initialEventId)) {
      return [initialEventId];
    }
    return items.slice(0, Math.min(3, items.length)).map((i) => i.event.id);
  });

  const [selectedKwIds, setSelectedKwIds] = useState<string[]>([]);
  const [customKeywords, setCustomKeywords] = useState<string[]>([]);
  const [customInput, setCustomInput] = useState('');
  const [showAllChips, setShowAllChips] = useState(false);

  const [rawWeights, setRawWeights] = useState<Record<DimensionKey, number>>(DEFAULT_RAW_WEIGHTS);
  const [decisions, setDecisions] = useState<Record<string, DecisionRecord>>({});
  const [reflections, setReflections] = useState<Record<string, ReflectionRecord>>({});
  const [overridesByEvent, setOverridesByEvent] = useState<Record<string, Partial<DimensionScores>>>({});

  const [isFlipping, setIsFlipping] = useState(false);
  const [batchRevealed, setBatchRevealed] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [tuningEventId, setTuningEventId] = useState<string | null>(null);
  const [reflectEventId, setReflectEventId] = useState<string | null>(null);

  // Reflection draft for currently open inline reflection row
  const [refDraft, setRefDraft] = useState<{
    takeaway: string;
    connection: string;
    followUp: string;
    energy?: EnergyLevel;
    actualHours: string;
  }>({ takeaway: '', connection: '', followUp: '', energy: undefined, actualHours: '' });
  const [refSaved, setRefSaved] = useState(false);

  // Persistent DOM refs for butter-smooth 60fps GPU-composited coin physics
  const coinRef = useRef<HTMLDivElement>(null);
  const shadowRef = useRef<HTMLDivElement>(null);
  const rippleRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);

  const hydrateAll = useCallback(() => {
    const prefs = loadKeywordPrefs();
    setSelectedKwIds(prefs.selectedIds);
    setCustomKeywords(prefs.customKeywords);
    setDecisions(loadAllDecisions());
    setReflections(loadAllReflections());
  }, []);

  useEffect(() => {
    hydrateAll();
    window.addEventListener(GONOGO_STORAGE_EVENT, hydrateAll);
    window.addEventListener('storage', hydrateAll);
    return () => {
      window.removeEventListener(GONOGO_STORAGE_EVENT, hydrateAll);
      window.removeEventListener('storage', hydrateAll);
    };
  }, [hydrateAll]);

  useEffect(() => {
    return () => {
      if (rafRef.current != null) window.cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const weights = useMemo(() => normalizeWeights(rawWeights), [rawWeights]);
  const weightPcts = useMemo(() => ({
    learning: Math.round(weights.learning * 100),
    networking: Math.round(weights.networking * 100),
    career: 100 - Math.round(weights.learning * 100) - Math.round(weights.networking * 100),
  }), [weights]);

  const pickedSet = useMemo(() => new Set(pickedIds), [pickedIds]);
  const pickedItems = useMemo(() => items.filter((i) => pickedSet.has(i.event.id)), [items, pickedSet]);

  // Evaluate ALL selected events in one batch
  const batchRows = useMemo(() => {
    return pickedItems
      .map((item) => {
        const ev = item.event;
        const ruleEval = evaluateEventRules(ev, selectedKwIds, customKeywords, lang);
        const ov = overridesByEvent[ev.id] ?? {};
        const scores: DimensionScores = {
          learning: ov.learning ?? ruleEval.suggested.learning.score,
          networking: ov.networking ?? ruleEval.suggested.networking.score,
          career: ov.career ?? ruleEval.suggested.career.score,
        };
        const total = clampScore(
          scores.learning * weights.learning +
          scores.networking * weights.networking +
          scores.career * weights.career,
        );
        const verdict = verdictFromScore(total);
        const time = estimateTimeCommitment(ev);
        const topReason =
          ruleEval.suggested.career.reasons[0] ||
          ruleEval.suggested.learning.reasons[0] ||
          ruleEval.suggested.networking.reasons[0] ||
          st.lowInfoShort;

        return { item, ev, ruleEval, scores, total, verdict, time, topReason };
      })
      .sort((a, b) => b.total - a.total);
  }, [pickedItems, selectedKwIds, customKeywords, lang, overridesByEvent, weights, st.lowInfoShort]);

  const batchSummary = useMemo(() => {
    let go = 0;
    let edge = 0;
    let notGo = 0;
    let goHours = 0;
    batchRows.forEach((r) => {
      if (r.verdict === 'go') {
        go++;
        goHours += r.time.totalHours;
      } else if (r.verdict === 'edge') {
        edge++;
      } else {
        notGo++;
      }
    });
    const leadVerdict: DecisionVerdict = go > 0 ? 'go' : edge > 0 ? 'edge' : 'not_go';
    return {
      go,
      edge,
      notGo,
      goHours: Math.round(goHours * 2) / 2,
      leadVerdict,
    };
  }, [batchRows]);

  // Relevant keywords aggregated across all selected events
  const batchRelevantKwIds = useMemo(() => {
    const counts = new Map<string, number>();
    batchRows.forEach((r) => {
      r.ruleEval.relevantPresetIds.forEach((id) => counts.set(id, (counts.get(id) ?? 0) + 1));
    });
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => id);
  }, [batchRows]);

  const relevantSet = useMemo(() => new Set(batchRelevantKwIds), [batchRelevantKwIds]);

  // Rest coin smoothly when not flipping
  useEffect(() => {
    if (isFlipping || !coinRef.current || !shadowRef.current) return;
    const v = batchSummary.leadVerdict;
    const ry = !batchRevealed ? 0 : v === 'go' ? 0 : v === 'not_go' ? 180 : 88;
    const rx = batchRevealed && v === 'edge' ? 6 : 8;
    coinRef.current.style.transform = `translate3d(0px, 0px, 0px) rotateX(${rx}deg) rotateY(${ry}deg) scale(1)`;
    shadowRef.current.style.transform = 'scale(1)';
    shadowRef.current.style.opacity = '0.24';
  }, [isFlipping, batchRevealed, batchSummary.leadVerdict]);

  const persistBatch = useCallback(() => {
    const nextDecisions = { ...decisions };
    batchRows.forEach((row) => {
      const prev = nextDecisions[row.ev.id];
      const rec: DecisionRecord = {
        eventId: row.ev.id,
        eventTitle: row.ev.title,
        scores: row.scores,
        total: row.total,
        verdict: row.verdict,
        finalChoice: prev?.finalChoice ?? null,
        selectedKeywords: selectedKwIds,
        attended: prev?.attended ?? false,
        updatedAt: new Date().toISOString(),
      };
      saveDecision(rec);
      nextDecisions[row.ev.id] = rec;
    });
    setDecisions(nextDecisions);
  }, [batchRows, decisions, selectedKwIds]);

  const launchBatchFlip = useCallback(() => {
    if (!batchRows.length || isFlipping) return;
    if (rafRef.current != null) window.cancelAnimationFrame(rafRef.current);

    if (soundEnabled) playCoinChime('launch');

    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduceMotion) {
      setBatchRevealed(true);
      persistBatch();
      return;
    }

    setIsFlipping(true);
    setBatchRevealed(false);

    const lead = batchSummary.leadVerdict;
    const targetFace = lead === 'go' ? 0 : lead === 'not_go' ? 180 : 88;
    const targetRotY = 5 * 360 + targetFace;
    const targetRotX = lead === 'edge' ? 6 : 8;
    const anticipation = 85;
    const duration = 1080;
    const start = performance.now();

    const tick = (now: number) => {
      const dt = now - start;
      const coinEl = coinRef.current;
      const shadowEl = shadowRef.current;
      if (!coinEl || !shadowEl) return;

      if (dt < anticipation) {
        const p = dt / anticipation;
        const dip = Math.sin(p * Math.PI) * 8;
        coinEl.style.transform = `translate3d(0px, ${dip.toFixed(1)}px, 0px) rotateX(${(8 + dip * 2.2).toFixed(1)}deg) rotateY(0deg) scale(${(1 - p * 0.045).toFixed(3)})`;
        shadowEl.style.transform = `scale(${(1 + p * 0.1).toFixed(3)})`;
        shadowEl.style.opacity = '0.3';
        rafRef.current = window.requestAnimationFrame(tick);
        return;
      }

      const raw = Math.min(1, (dt - anticipation) / duration);
      const spinEase = 1 - Math.pow(1 - raw, 3);
      const rotY = spinEase * targetRotY;

      let y = 0;
      let rotX = targetRotX;
      if (raw < 0.78) {
        const u = raw / 0.78;
        y = -4 * 124 * u * (1 - u);
        rotX = Math.sin(u * Math.PI * 2) * 26 + targetRotX;
      } else {
        const b = (raw - 0.78) / 0.22;
        y = -Math.abs(Math.sin(b * Math.PI * 1.5)) * 16 * (1 - b);
        rotX = targetRotX + Math.sin(b * Math.PI * 2) * 10 * (1 - b);
      }

      const hf = Math.min(1, Math.abs(y) / 124);
      const scale = 1 + hf * 0.13;
      coinEl.style.transform = `translate3d(0px, ${y.toFixed(1)}px, 0px) rotateX(${rotX.toFixed(1)}deg) rotateY(${rotY.toFixed(1)}deg) scale(${scale.toFixed(3)})`;
      shadowEl.style.transform = `scale(${(1 - hf * 0.54).toFixed(3)})`;
      shadowEl.style.opacity = (0.25 - hf * 0.17).toFixed(3);

      if (raw < 1) {
        rafRef.current = window.requestAnimationFrame(tick);
      } else {
        coinEl.style.transform = `translate3d(0px, 0px, 0px) rotateX(${targetRotX}deg) rotateY(${targetFace}deg) scale(1)`;
        shadowEl.style.transform = 'scale(1)';
        shadowEl.style.opacity = '0.24';
        if (rippleRef.current) {
          rippleRef.current.classList.remove('coin-ripple--active');
          void rippleRef.current.offsetWidth;
          rippleRef.current.classList.add('coin-ripple--active');
        }
        if (soundEnabled) playCoinChime(lead);
        setIsFlipping(false);
        setBatchRevealed(true);
        persistBatch();
      }
    };

    rafRef.current = window.requestAnimationFrame(tick);
  }, [batchRows.length, batchSummary.leadVerdict, isFlipping, persistBatch, soundEnabled]);

  // Spacebar flips the batch coin
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (reflectEventId) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.code === 'Space') {
        e.preventDefault();
        launchBatchFlip();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [launchBatchFlip, reflectEventId]);

  const togglePick = (id: string) => {
    setPickedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    setBatchRevealed(false);
  };

  const toggleKeyword = (id: string) => {
    const next = selectedKwIds.includes(id)
      ? selectedKwIds.filter((x) => x !== id)
      : [...selectedKwIds, id];
    setSelectedKwIds(next);
    saveKeywordPrefs({ selectedIds: next, customKeywords });
    setBatchRevealed(false);
  };

  const addCustomKeyword = () => {
    const cleaned = customInput.trim().slice(0, 28);
    if (!cleaned) return;
    const tok = `custom:${cleaned}`;
    const nextCustom = customKeywords.includes(cleaned) ? customKeywords : [cleaned, ...customKeywords].slice(0, 10);
    const nextSelected = selectedKwIds.includes(tok) ? selectedKwIds : [...selectedKwIds, tok];
    setCustomKeywords(nextCustom);
    setSelectedKwIds(nextSelected);
    setCustomInput('');
    saveKeywordPrefs({ selectedIds: nextSelected, customKeywords: nextCustom });
    setBatchRevealed(false);
  };

  const setRowChoice = (row: (typeof batchRows)[number], choice: Exclude<FinalChoice, null>) => {
    const prev = decisions[row.ev.id];
    const nextChoice: FinalChoice = prev?.finalChoice === choice ? null : choice;
    const rec: DecisionRecord = {
      eventId: row.ev.id,
      eventTitle: row.ev.title,
      scores: row.scores,
      total: row.total,
      verdict: row.verdict,
      finalChoice: nextChoice,
      selectedKeywords: selectedKwIds,
      attended: prev?.attended ?? false,
      updatedAt: new Date().toISOString(),
    };
    saveDecision(rec);
    setDecisions((all) => ({ ...all, [row.ev.id]: rec }));
  };

  const openReflect = (evId: string) => {
    if (reflectEventId === evId) {
      setReflectEventId(null);
      return;
    }
    const existing = reflections[evId];
    setRefDraft({
      takeaway: existing?.takeaway ?? '',
      connection: existing?.connection ?? '',
      followUp: existing?.followUp ?? '',
      energy: existing?.energy,
      actualHours: existing?.actualHours ?? '',
    });
    setRefSaved(false);
    setReflectEventId(evId);
  };

  const saveInlineReflection = (ev: EventEvalContext, e: React.FormEvent) => {
    e.preventDefault();
    const rec: ReflectionRecord = {
      eventId: ev.id,
      takeaway: refDraft.takeaway.trim(),
      connection: refDraft.connection.trim(),
      followUp: refDraft.followUp.trim(),
      energy: refDraft.energy,
      actualHours: refDraft.actualHours.trim() || undefined,
      updatedAt: new Date().toISOString(),
    };
    saveReflection(rec);
    setReflections((all) => ({ ...all, [ev.id]: rec }));
    const dec = setEventAttended(ev.id, ev.title, true);
    setDecisions((all) => ({ ...all, [ev.id]: dec }));
    setRefSaved(true);
  };

  // Group shelf items by date
  const shelfGroups = useMemo(() => {
    const map = new Map<string, StudioEventItem[]>();
    items.forEach((it) => {
      const list = map.get(it.shortDate) ?? [];
      list.push(it);
      map.set(it.shortDate, list);
    });
    return Array.from(map.entries());
  }, [items]);

  if (!items.length) {
    return <div className="card p-8 text-center text-sm text-muted">{st.shelfEmpty}</div>;
  }

  const quickChipIds = Array.from(
    new Set([...batchRelevantKwIds, ...selectedKwIds.filter((id) => !id.startsWith('custom:'))]),
  ).slice(0, 7);
  const visibleChipIds = quickChipIds.length > 0 ? quickChipIds : ['llm_agents', 'ai_eng', 'job_search', 'hands_on', 'startups_vc'];
  const isCustomWeights =
    rawWeights.learning !== DEFAULT_RAW_WEIGHTS.learning ||
    rawWeights.networking !== DEFAULT_RAW_WEIGHTS.networking ||
    rawWeights.career !== DEFAULT_RAW_WEIGHTS.career;

  return (
    <div className="grid gap-6 lg:grid-cols-[330px_minmax(0,1fr)] lg:items-start">
      {/* LEFT COLUMN: Multi-Select Bookshelf of Candidate Events */}
      <aside className="card overflow-hidden">
        <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3">
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-semibold">{st.shelfTitle}</h1>
            <span className="badge badge-primary tabular-nums">{st.selectedBadge(pickedIds.length)}</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <button
              type="button"
              onClick={() => {
                setPickedIds(items.map((i) => i.event.id));
                setBatchRevealed(false);
              }}
              className="text-muted hover:text-[var(--foreground)] hover:underline"
            >
              {st.selectAll}
            </button>
            <span className="text-muted">·</span>
            <button
              type="button"
              onClick={() => {
                setPickedIds([]);
                setBatchRevealed(false);
              }}
              className="text-muted hover:text-[var(--foreground)] hover:underline"
            >
              {st.clearAll}
            </button>
          </div>
        </div>

        <div className="max-h-[74vh] space-y-4 overflow-y-auto p-3.5">
          {shelfGroups.map(([dayLabel, group]) => (
            <div key={dayLabel} className="shelf-tier">
              <div className="mb-1.5 flex items-center justify-between px-1">
                <span className="text-[11px] font-semibold tracking-wide text-muted tabular-nums">{dayLabel}</span>
                <span className="text-[11px] text-muted tabular-nums">{group.length}</span>
              </div>
              <ul className="space-y-1.5">
                {group.map((it) => {
                  const ev = it.event;
                  const checked = pickedSet.has(ev.id);
                  const isHiring = ev.hiringCompanies.length > 0;
                  const dec = decisions[ev.id];
                  const stamp = dec
                    ? dec.finalChoice === 'go'
                      ? t.verdicts.go.coinLabel
                      : dec.finalChoice === 'skip'
                        ? t.verdicts.not_go.coinLabel
                        : t.verdicts[dec.verdict].coinLabel
                    : null;
                  const stampIsGo = dec && (dec.finalChoice === 'go' || (!dec.finalChoice && dec.verdict === 'go'));
                  const zhSummary = lang === 'zh' ? getZhEventSummary(ev) : '';

                  return (
                    <li key={ev.id}>
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={checked}
                        onClick={() => togglePick(ev.id)}
                        className={`shelf-book w-full text-left ${checked ? 'shelf-book--active' : ''} ${isHiring ? 'shelf-book--hiring' : ''}`}
                      >
                        <div className="flex items-start gap-2.5">
                          <span
                            aria-hidden="true"
                            className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded border text-[10px] font-bold transition-colors ${
                              checked
                                ? 'border-[var(--primary)] bg-[var(--primary)] text-white'
                                : 'border-[#d4d4d4] bg-white text-transparent'
                            }`}
                          >
                            ✓
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                {zhSummary && (
                                  <span className="block truncate text-[12px] font-semibold leading-snug text-[var(--primary)]">
                                    {zhSummary}
                                  </span>
                                )}
                                <span className={`line-clamp-2 leading-snug ${zhSummary ? 'mt-0.5 text-[12px] text-[#404040]' : 'text-[13px] font-medium text-[var(--foreground)]'}`}>
                                  {ev.title}
                                </span>
                              </div>
                              {stamp && (
                                <span
                                  className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                                    stampIsGo ? 'bg-[var(--primary-soft)] text-[var(--primary)]' : 'bg-[var(--muted)] text-muted'
                                  }`}
                                >
                                  {stamp}
                                </span>
                              )}
                            </div>
                            <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted">
                              {isHiring && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--primary)]" aria-hidden="true" />}
                              <span className="truncate">{ev.mrtName || (ev.isOnline ? t.contextOnline : ev.venue)}</span>
                              {isHiring && (
                                <span className="ml-auto shrink-0 font-medium text-[var(--primary)]">
                                  {ev.hiringCompanies[0].name}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <div className="shelf-ledge" aria-hidden="true" />
            </div>
          ))}
        </div>
      </aside>

      {/* RIGHT COLUMN: Batch Evaluation + 60fps 3D Coin Stage */}
      <section className="card flex flex-col overflow-hidden">
        {/* Compact Focus Chips + Sound Toggle */}
        <div className="space-y-3 border-b border-[var(--border)] px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {visibleChipIds.map((id) => {
                const selected = selectedKwIds.includes(id);
                const relevant = relevantSet.has(id);
                return (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => toggleKeyword(id)}
                    className={`kw-chip ${relevant ? 'kw-chip--relevant' : ''} ${selected ? 'kw-chip--selected' : ''}`}
                  >
                    {relevant && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />}
                    {t.keywords[id] ?? id}
                  </button>
                );
              })}
              {customKeywords.map((kw) => {
                const tok = `custom:${kw}`;
                const selected = selectedKwIds.includes(tok);
                return (
                  <button
                    key={tok}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => toggleKeyword(tok)}
                    className={`kw-chip ${selected ? 'kw-chip--selected' : ''}`}
                  >
                    {kw}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setShowAllChips((v) => !v)}
                className="kw-chip text-muted"
              >
                {showAllChips ? st.lessChips : `+ ${st.moreChips}`}
              </button>
            </div>
            <button
              type="button"
              onClick={() => setSoundEnabled((v) => !v)}
              title={soundEnabled ? st.soundOn : st.soundOff}
              aria-label={soundEnabled ? st.soundOn : st.soundOff}
              className="btn btn-sm !px-2 shrink-0 text-xs text-muted"
            >
              {soundEnabled ? '♪' : '×'}
            </button>
          </div>

          {showAllChips && (
            <div className="space-y-2 rounded-lg border border-[var(--border)] bg-[#fafafa] p-3">
              {KEYWORD_CATEGORIES.map((cat) => (
                <div key={cat} className="flex flex-wrap items-center gap-1.5">
                  <span className="mr-1 text-[11px] font-medium text-muted">{t.categories[cat]}</span>
                  {KEYWORD_PRESETS.filter((k) => k.category === cat).map((item) => {
                    const selected = selectedKwIds.includes(item.id);
                    const relevant = relevantSet.has(item.id);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => toggleKeyword(item.id)}
                        className={`kw-chip !h-6 !px-2.5 !text-[11px] ${relevant ? 'kw-chip--relevant' : ''} ${selected ? 'kw-chip--selected' : ''}`}
                      >
                        {t.keywords[item.id] ?? item.id}
                      </button>
                    );
                  })}
                </div>
              ))}
              <form
                className="flex gap-2 pt-1"
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
                  className="input h-7 text-xs"
                  maxLength={28}
                />
                <button type="submit" className="btn btn-sm !h-7 shrink-0 text-xs">{t.customAdd}</button>
              </form>
            </div>
          )}

          {/* Slim Batch Weight Bar (50 / 15 / 35 default) */}
          <div className="grid gap-3 rounded-lg border border-[var(--border)] bg-[#fafafa] px-3.5 py-2.5 sm:grid-cols-3">
            {DIMENSIONS.map((key) => (
              <div key={key} className="space-y-1">
                <div className="flex items-baseline justify-between text-xs">
                  <span className="font-medium">{t.dimensions[key].name}</span>
                  <span className="font-semibold tabular-nums">{weightPcts[key]}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={rawWeights[key]}
                  aria-label={t.dimensions[key].name}
                  onChange={(e) => {
                    setRawWeights((prev) => ({ ...prev, [key]: Number(e.target.value) }));
                    setBatchRevealed(false);
                  }}
                  className="gonogo-slider w-full"
                />
              </div>
            ))}
          </div>
          {isCustomWeights && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setRawWeights(DEFAULT_RAW_WEIGHTS);
                  setBatchRevealed(false);
                }}
                className="text-[11px] text-[var(--primary)] hover:underline"
              >
                {st.resetWeights}
              </button>
            </div>
          )}
        </div>

        {/* CENTERPIECE: 60fps 3D Coin Launchpad */}
        <div className="flex flex-col items-center justify-center px-5 py-5 text-center">
          {batchRows.length === 0 ? (
            <p className="py-12 text-sm text-muted">{st.emptySelection}</p>
          ) : (
            <>
              <div className="coin3d-arena">
                <div ref={rippleRef} className="coin-ripple" aria-hidden="true" />
                <button
                  type="button"
                  onClick={launchBatchFlip}
                  disabled={isFlipping}
                  aria-label={st.flipCta(batchRows.length)}
                  className="coin3d-btn"
                >
                  <div ref={coinRef} className="coin3d-object">
                    {RIM_SLICES.map((z) => (
                      <div key={z} className="coin3d-rim" style={{ transform: `translateZ(${z}px)` }} aria-hidden="true" />
                    ))}
                    <div className="coin3d-face coin3d-face--front" aria-hidden="true">
                      <svg viewBox="0 0 140 140" className="h-full w-full" fill="none">
                        <circle cx="70" cy="70" r="64" stroke="#1257FD" strokeWidth="1.2" />
                        <circle cx="70" cy="70" r="56" stroke="#1257FD" strokeWidth="0.75" strokeDasharray="2 3" strokeOpacity="0.55" />
                        <circle cx="70" cy="54" r="18" stroke="#1257FD" strokeWidth="1" strokeOpacity="0.35" />
                        <path d="M59 65L81 43" stroke="#1257FD" strokeWidth="1.8" strokeLinecap="round" />
                        <path d="M66 43H81V58" stroke="#1257FD" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        <text x="70" y="102" textAnchor="middle" fill="#1257FD" fontSize="14" fontWeight="700" letterSpacing="0.16em">
                          GO
                        </text>
                      </svg>
                    </div>
                    <div className="coin3d-face coin3d-face--back" aria-hidden="true">
                      <svg viewBox="0 0 140 140" className="h-full w-full" fill="none">
                        <circle cx="70" cy="70" r="64" stroke="#0A0A0A" strokeWidth="1.2" />
                        <circle cx="70" cy="70" r="56" stroke="#0A0A0A" strokeWidth="0.75" strokeDasharray="2 3" strokeOpacity="0.45" />
                        <circle cx="70" cy="54" r="17" stroke="#0A0A0A" strokeWidth="1" strokeOpacity="0.3" />
                        <line x1="63" y1="44" x2="63" y2="64" stroke="#0A0A0A" strokeWidth="1.8" strokeLinecap="round" />
                        <line x1="77" y1="44" x2="77" y2="64" stroke="#0A0A0A" strokeWidth="1.8" strokeLinecap="round" />
                        <text x="70" y="102" textAnchor="middle" fill="#0A0A0A" fontSize="13" fontWeight="700" letterSpacing="0.12em">
                          NO GO
                        </text>
                      </svg>
                    </div>
                  </div>
                </button>
                <div ref={shadowRef} className="coin3d-shadow" aria-hidden="true" />
              </div>

              <div className="mt-3 flex flex-col items-center gap-1.5">
                <button
                  type="button"
                  onClick={launchBatchFlip}
                  disabled={isFlipping}
                  className="btn btn-primary btn-lg min-w-[176px]"
                >
                  {isFlipping ? '···' : batchRevealed ? st.reFlip : st.flipCta(batchRows.length)}
                </button>
                {!batchRevealed && <p className="text-[11px] text-muted">{st.flipKeyHint}</p>}
              </div>
            </>
          )}
        </div>

        {/* RANKED BATCH RESULTS BOARD */}
        {batchRevealed && !isFlipping && batchRows.length > 0 && (
          <div className="border-t border-[var(--border)] bg-[#fafafa] p-5 space-y-3.5">
            {/* Compact Batch Summary Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5 text-xs font-medium tabular-nums">
                <span className="badge badge-primary">{st.tallyGo(batchSummary.go)}</span>
                <span className="badge">{st.tallyEdge(batchSummary.edge)}</span>
                <span className="badge badge-muted">{st.tallySkip(batchSummary.notGo)}</span>
              </div>
              {batchSummary.go > 0 && (
                <span className="text-xs font-medium text-muted tabular-nums">
                  {st.batchGoHours(String(batchSummary.goHours))}
                </span>
              )}
            </div>

            {/* 1 Concise Weekly Reflective Question */}
            <p className="rounded-lg border border-[var(--border)] bg-white px-3.5 py-2.5 text-xs leading-relaxed text-[var(--foreground)]">
              “{st.weeklyQuestion(batchSummary.go, String(batchSummary.goHours))}”
            </p>

            {/* Ranked Result Cards */}
            <ul className="space-y-2">
              {batchRows.map((row) => {
                const dec = decisions[row.ev.id];
                const ref = reflections[row.ev.id];
                const hasRef = Boolean(ref && (ref.takeaway || ref.connection || ref.followUp || ref.energy));
                const canReflect = isEventEnded(row.ev) || Boolean(dec?.attended) || hasRef || dec?.finalChoice === 'go';
                const isTuning = tuningEventId === row.ev.id;
                const isReflecting = reflectEventId === row.ev.id;
                const isGo = row.verdict === 'go';

                return (
                  <li key={row.ev.id} className="rounded-lg border border-[var(--border)] bg-white p-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex min-w-0 flex-1 items-start gap-3">
                        {/* Verdict + Score Pill */}
                        <div
                          className={`flex w-[64px] shrink-0 flex-col items-center justify-center rounded-md border py-1.5 text-center ${
                            isGo
                              ? 'border-[#b8cefe] bg-[var(--primary-soft)] text-[var(--primary)]'
                              : row.verdict === 'edge'
                                ? 'border-[var(--border)] bg-white text-[var(--foreground)]'
                                : 'border-transparent bg-[var(--muted)] text-muted'
                          }`}
                        >
                          <span className="text-[11px] font-bold leading-none">{t.verdicts[row.verdict].coinLabel}</span>
                          <span className="mt-0.5 text-xs font-semibold tabular-nums leading-none">{row.total}</span>
                        </div>

                        <div className="min-w-0 flex-1">
                          {lang === 'zh' && getZhEventSummary(row.ev) && (
                            <p className="truncate text-[11px] font-semibold text-[var(--primary)]">
                              {getZhEventSummary(row.ev)}
                            </p>
                          )}
                          <p className="truncate text-[13px] font-semibold text-[var(--foreground)]">{row.ev.title}</p>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted">
                            <span className="tabular-nums">{row.item.shortDate}</span>
                            <span>·</span>
                            <span>{row.ev.mrtName || row.ev.venue}</span>
                            <span>·</span>
                            <span className="tabular-nums">{st.hoursShort(String(row.time.totalHours))}</span>
                            <span>·</span>
                            <span className="truncate">{row.topReason}</span>
                          </div>
                        </div>
                      </div>

                      {/* Quick Row Actions */}
                      <div className="flex shrink-0 items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setRowChoice(row, 'go')}
                          className={`btn btn-sm !h-7 !px-2.5 text-xs ${dec?.finalChoice === 'go' ? 'btn-primary' : ''}`}
                        >
                          {dec?.finalChoice === 'go' ? `✓ ${t.chosenGoBadge}` : t.chooseGo}
                        </button>
                        <button
                          type="button"
                          onClick={() => setRowChoice(row, 'skip')}
                          className={`btn btn-sm !h-7 !px-2 text-xs ${
                            dec?.finalChoice === 'skip' ? '!border-[var(--foreground)] !bg-[var(--foreground)] !text-white' : 'text-muted'
                          }`}
                        >
                          {t.chooseSkip}
                        </button>
                        <button
                          type="button"
                          onClick={() => setTuningEventId(isTuning ? null : row.ev.id)}
                          className={`btn btn-sm !h-7 !px-2 text-xs ${isTuning ? 'border-[var(--primary)] text-[var(--primary)]' : 'text-muted'}`}
                        >
                          {st.tuneBtn}
                        </button>
                        {canReflect && (
                          <button
                            type="button"
                            onClick={() => openReflect(row.ev.id)}
                            className="btn btn-sm !h-7 !px-2 text-xs"
                          >
                            {hasRef ? `✓ ${t.reflectedBadge}` : t.reflectBtn}
                          </button>
                        )}
                        <a
                          href={row.ev.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={dict.events.register}
                          className="btn btn-sm !h-7 !px-2 text-xs text-muted"
                        >
                          ↗
                        </a>
                      </div>
                    </div>

                    {/* Optional Individual 3-Slider Override */}
                    {isTuning && (
                      <div className="mt-3 grid gap-3 border-t border-[var(--border)] pt-3 sm:grid-cols-3">
                        {DIMENSIONS.map((k) => (
                          <div key={k} className="space-y-1">
                            <div className="flex justify-between text-[11px]">
                              <span className="text-muted">{t.dimensions[k].name}</span>
                              <span className="font-semibold tabular-nums">{row.scores[k]}</span>
                            </div>
                            <input
                              type="range"
                              min={0}
                              max={100}
                              step={1}
                              value={row.scores[k]}
                              onChange={(e) => {
                                const val = Number(e.target.value);
                                setOverridesByEvent((prev) => ({
                                  ...prev,
                                  [row.ev.id]: { ...(prev[row.ev.id] ?? {}), [k]: val },
                                }));
                              }}
                              className="gonogo-slider w-full"
                            />
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Optional Inline 3-Question Reflection */}
                    {isReflecting && (
                      <form
                        onSubmit={(e) => saveInlineReflection(row.ev, e)}
                        className="mt-3 space-y-2.5 border-t border-[var(--border)] pt-3"
                      >
                        <input
                          type="text"
                          value={refDraft.takeaway}
                          onChange={(e) => { setRefDraft((p) => ({ ...p, takeaway: e.target.value })); setRefSaved(false); }}
                          placeholder={t.qTakeaway}
                          className="input h-8 text-xs"
                        />
                        <input
                          type="text"
                          value={refDraft.connection}
                          onChange={(e) => { setRefDraft((p) => ({ ...p, connection: e.target.value })); setRefSaved(false); }}
                          placeholder={t.qConnection}
                          className="input h-8 text-xs"
                        />
                        <input
                          type="text"
                          value={refDraft.followUp}
                          onChange={(e) => { setRefDraft((p) => ({ ...p, followUp: e.target.value })); setRefSaved(false); }}
                          placeholder={t.qFollowUp}
                          className="input h-8 text-xs"
                        />
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            {(['drained', 'neutral', 'energized'] as const).map((lvl) => (
                              <button
                                key={lvl}
                                type="button"
                                onClick={() => { setRefDraft((p) => ({ ...p, energy: p.energy === lvl ? undefined : lvl })); setRefSaved(false); }}
                                className={`kw-chip !h-6 !text-[11px] ${refDraft.energy === lvl ? 'kw-chip--selected' : ''}`}
                              >
                                {t.energy[lvl]}
                              </button>
                            ))}
                          </div>
                          <div className="flex items-center gap-2">
                            {refSaved && <span className="text-xs text-[var(--primary)]">✓ {t.savedReflection}</span>}
                            <button type="submit" className="btn btn-primary btn-sm !h-7 text-xs">{t.saveReflection}</button>
                          </div>
                        </div>
                      </form>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
