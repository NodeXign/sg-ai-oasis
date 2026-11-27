'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Lang, SgEvent } from '@/lib/types';
import { resolveEventGeo } from '@/lib/sg-geo';
import { renderClientMapSnapshot } from '@/lib/client-map-snapshot';
import { renderCardHtmlToPngClient } from '@/lib/client-card-png';
import {
  checkFooterTopic,
  generateXhsLifePack,
  inferAudienceFit,
  sgDateKey,
  type DiagrammeStyle,
  type XhsEventItem,
} from '@/lib/xhs-life-cards';

const LOCAL_FRIEND_KEY = 'sg_ai_oasis_admin_friend_events_v1';

interface Props {
  lang: Lang;
  syncedEvents: XhsEventItem[];
  initialFriendEvents: XhsEventItem[];
  defaultStartDate: string;
  defaultEndDate: string;
}

interface EnvStatus {
  checked: boolean;
  rendererAvailable: boolean;
  playwrightFound: boolean;
  browserFound: boolean;
  authRequired: boolean;
  renderCommand: string;
}

interface ParseCapabilities {
  checked: boolean;
  urlParseAvailable: boolean;
  textParseAvailable: boolean;
  ocrAvailable: boolean;
  ocrEngine: string;
}

interface RenderedPageResult {
  pageNumber: string;
  filename: string;
  pngFilename: string;
  pngDataUrl: string;
  scrollHeight: number;
  overflow: boolean;
  imagesOk: boolean;
  hasBrandPill: boolean;
  hasStaySgLogo: boolean;
}

interface FriendFormState {
  id?: string;
  title: string;
  date: string;       // YYYY-MM-DD (SGT)
  startTime: string;  // HH:MM
  endTime: string;    // HH:MM
  organiser: string;
  isOnline: boolean;
  venue: string;
  address: string;
  lat?: number | null;
  lng?: number | null;
  url: string;
  coverImageUrl?: string | null;
  isFree: boolean;
  price: string;
  status: 'open' | 'approval' | 'waitlist' | 'sold_out';
  friendNote: string;
  publishToSite: boolean;
}

function addDaysYmd(ymd: string, delta: number): string {
  const d = new Date(`${ymd}T12:00:00+08:00`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' });
}

function nextSundayToSunday(todayYmd: string): [string, string] {
  const d = new Date(`${todayYmd}T12:00:00+08:00`);
  const day = d.getUTCDay();
  const daysUntilSun = day === 0 ? 0 : 7 - day;
  const start = addDaysYmd(todayYmd, daysUntilSun);
  const end = addDaysYmd(start, 7);
  return [start, end];
}

function toSgtIso(dateYmd: string, timeHm: string): string {
  const safeTime = /^\d{2}:\d{2}$/.test(timeHm) ? timeHm : '19:00';
  return new Date(`${dateYmd}T${safeTime}:00+08:00`).toISOString();
}

function fmtShortDayTime(iso: string): string {
  const d = new Date(iso);
  const ymd = sgDateKey(iso);
  const parts = ymd.split('-');
  const md = parts.length === 3 ? `${Number(parts[1])}/${Number(parts[2])}` : ymd;
  const wd = new Intl.DateTimeFormat('zh-CN', { weekday: 'short', timeZone: 'Asia/Singapore' }).format(d);
  const tm = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Singapore' }).format(d);
  return `${md} ${wd} ${tm}`;
}

function downloadTextFile(filename: string, content: string, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadDataUrl(filename: string, dataUrl: string) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

const STYLE_LABELS: Record<DiagrammeStyle, string> = {
  notionaly: 'Notionaly',
  'diagram-design': 'Diagram Design',
  hairline: 'Hairline',
};

function emptyFriendForm(defaultDate: string): FriendFormState {
  return {
    title: '',
    date: defaultDate,
    startTime: '19:00',
    endTime: '21:00',
    organiser: '',
    isOnline: false,
    venue: '',
    address: '',
    lat: null,
    lng: null,
    url: '',
    coverImageUrl: null,
    isFree: true,
    price: '',
    status: 'open',
    friendNote: '',
    publishToSite: false,
  };
}

export default function XhsAdminStudio({
  lang,
  syncedEvents,
  initialFriendEvents,
  defaultStartDate,
  defaultEndDate,
}: Props) {
  const isZh = lang === 'zh';

  // ── Left workbench tab ──
  const [activeTab, setActiveTab] = useState<'events' | 'friends' | 'style'>('events');

  // ── Friend events state (server file + localStorage sync fallback) ──
  const [friendEvents, setFriendEvents] = useState<XhsEventItem[]>(initialFriendEvents);
  const [storageMode, setStorageMode] = useState<'file' | 'readonly'>('file');
  const [adminToken, setAdminToken] = useState('');
  const [friendForm, setFriendForm] = useState<FriendFormState>(() => emptyFriendForm(defaultStartDate));
  const [friendFeedback, setFriendFeedback] = useState<string | null>(null);
  const [savingFriend, setSavingFriend] = useState(false);

  // ── Smart Import (URL / Text / Poster Image) state ──
  const [smartInput, setSmartInput] = useState('');
  const [smartImageFile, setSmartImageFile] = useState<File | null>(null);
  const [smartImagePreview, setSmartImagePreview] = useState<string | null>(null);
  const [smartParsing, setSmartParsing] = useState(false);
  const [smartStatus, setSmartStatus] = useState<{
    kind: 'ok' | 'warn' | 'err';
    message: string;
    sources?: string[];
    rawOcrText?: string;
  } | null>(null);
  const [isDraggingImg, setIsDraggingImg] = useState(false);
  const [parseCaps, setParseCaps] = useState<ParseCapabilities>({
    checked: false,
    urlParseAvailable: true,
    textParseAvailable: true,
    ocrAvailable: false,
    ocrEngine: 'none',
  });

  // ── Date range & event selection ──
  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState(defaultEndDate);
  const [eventFilter, setEventFilter] = useState<'all' | 'friends' | 'hiring' | 'free'>('all');
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());
  const [pickIds, setPickIds] = useState<string[]>([]);
  const [audienceNotes, setAudienceNotes] = useState<Record<string, string>>({});
  const [customPosters, setCustomPosters] = useState<Record<string, string>>({});

  // ── Deck & Diagramme config (5 cards) ──
  const [kicker, setKicker] = useState('SG AI OASIS · 新加坡 AI 活动观察');
  const [footerTopic, setFooterTopic] = useState('SG AI OASIS · 新加坡 AI 活动地图');
  const [coverTitle, setCoverTitle] = useState('');
  const [coverIntro, setCoverIntro] = useState('');
  const [siteUrl, setSiteUrl] = useState('sgaioasis.vercel.app/zh');
  const [searchKeywords, setSearchKeywords] = useState('SG AI Oasis · sgaioasis · 人在坡岛');
  const [coverMapSnapshotDataUrl, setCoverMapSnapshotDataUrl] = useState<string | null>(null);
  const [manualCoverMap, setManualCoverMap] = useState(false);
  const [capturedMapKey, setCapturedMapKey] = useState('');
  const [card3StatHighlight, setCard3StatHighlight] = useState('');
  const [card4Title, setCard4Title] = useState('去现场前先看两件事：\n谁在招人？值不值得去？');
  const [card4Intro, setCard4Intro] = useState(
    '在 SG AI Oasis 网站上，点开任意一场活动就能直接跳去对应主办方官网岗位；刚更新的 GO/NOGO 小工具也能 30 秒帮你判断是否值得花这个时间。',
  );
  const [card4Point1Title, setCard4Point1Title] = useState('① 现场活动 → 直连主办方官网');
  const [card4Point1Body, setCard4Point1Body] = useState(
    '不用靠人脉打听，直接看到哪家在招公司在办活动，点一下链接就能核对新加坡公开岗位。',
  );
  const [card4Point2Title, setCard4Point2Title] = useState('② GO / NOGO 去不去小工具');
  const [card4Point2Body, setCard4Point2Body] = useState(
    '勾选你关心的主题，按学习 / 人脉 / 职业三维打分并估算通勤耗时，抛硬币帮你做清醒取舍。',
  );
  const [card4ScreenshotDataUrl, setCard4ScreenshotDataUrl] = useState<string | null>(null);
  const [capturingTarget, setCapturingTarget] = useState<'map' | 'gonogo' | null>(null);

  const [includeOverflowChecklist, setIncludeOverflowChecklist] = useState(true);
  const [exceptionReason, setExceptionReason] = useState('');
  const [cardHtmlOverrides, setCardHtmlOverrides] = useState<Record<string, string>>({});
  const [renderProgress, setRenderProgress] = useState<string | null>(null);

  // ── Preview & Export state ──
  const [activePageIdx, setActivePageIdx] = useState(0);
  const [showHtmlEditor, setShowHtmlEditor] = useState(false);
  const [captionOverride, setCaptionOverride] = useState<string | null>(null);
  const [copiedCaption, setCopiedCaption] = useState(false);
  const [envStatus, setEnvStatus] = useState<EnvStatus>({
    checked: false,
    rendererAvailable: false,
    playwrightFound: false,
    browserFound: false,
    authRequired: false,
    renderCommand: 'node ~/AI-Harness/templates/diagramme-xhs/render.mjs --dir <folder>',
  });
  const [rendering, setRendering] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [renderedPages, setRenderedPages] = useState<RenderedPageResult[]>([]);
  const [savedDiskDir, setSavedDiskDir] = useState<string | null>(null);

  const previewWrapRef = useRef<HTMLDivElement | null>(null);
  const [previewWidth, setPreviewWidth] = useState(440);

  // Merge localStorage friend events (read-only fallback)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LOCAL_FRIEND_KEY);
      if (raw) {
        const localItems = JSON.parse(raw) as XhsEventItem[];
        if (Array.isArray(localItems) && localItems.length > 0) {
          setFriendEvents((prev) => {
            const map = new Map(prev.map((e) => [e.id, e]));
            for (const item of localItems) {
              if (!map.has(item.id)) map.set(item.id, item);
            }
            return Array.from(map.values()).sort((a, b) => a.startAt.localeCompare(b.startAt));
          });
        }
      }
    } catch {
      // ignore
    }
  }, []);

  // Check Playwright / Chrome & OCR capabilities on mount
  useEffect(() => {
    let alive = true;
    fetch('/api/admin/export-pack')
      .then((r) => r.json())
      .then((data) => {
        if (!alive) return;
        setEnvStatus({
          checked: true,
          rendererAvailable: Boolean(data.rendererAvailable),
          playwrightFound: Boolean(data.playwrightFound),
          browserFound: Boolean(data.browserFound),
          authRequired: Boolean(data.authRequired),
          renderCommand: data.renderCommand || 'node ~/AI-Harness/templates/diagramme-xhs/render.mjs --dir <folder>',
        });
      })
      .catch(() => {
        if (alive) setEnvStatus((s) => ({ ...s, checked: true }));
      });

    fetch('/api/admin/parse-event')
      .then((r) => r.json())
      .then((data) => {
        if (!alive) return;
        setParseCaps({
          checked: true,
          urlParseAvailable: Boolean(data.urlParseAvailable),
          textParseAvailable: Boolean(data.textParseAvailable),
          ocrAvailable: Boolean(data.ocrAvailable),
          ocrEngine: data.ocrEngine || 'none',
        });
      })
      .catch(() => {
        if (alive) setParseCaps((c) => ({ ...c, checked: true }));
      });

    return () => {
      alive = false;
    };
  }, []);

  // Measure preview container for crisp 1080x1440 scaling
  useEffect(() => {
    const el = previewWrapRef.current;
    if (!el) return;
    const update = () => {
      const w = el.clientWidth;
      if (w > 120) setPreviewWidth(Math.min(w, 540));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Combined event pool: friend events + synced events
  const allEvents = useMemo<XhsEventItem[]>(() => {
    const map = new Map<string, XhsEventItem>();
    for (const e of syncedEvents) map.set(e.id, e);
    for (const f of friendEvents) map.set(f.id, { ...f, isFriendEvent: true });
    return Array.from(map.values()).sort((a, b) => a.startAt.localeCompare(b.startAt));
  }, [syncedEvents, friendEvents]);

  // Events inside selected SGT date range
  const eventsInRange = useMemo(() => {
    return allEvents.filter((e) => {
      const day = sgDateKey(e.startAt);
      return day >= startDate && day <= endDate;
    });
  }, [allEvents, startDate, endDate]);

  const visibleRangeEvents = useMemo(() => {
    return eventsInRange.filter((e) => {
      if (eventFilter === 'friends') return Boolean(e.isFriendEvent);
      if (eventFilter === 'hiring') return (e.hiringCompanyNames?.length ?? 0) > 0;
      if (eventFilter === 'free') return e.isFree === true;
      return true;
    });
  }, [eventsInRange, eventFilter]);

  const selectedEventsList = useMemo(
    () => eventsInRange.filter((e) => !excludedIds.has(e.id)),
    [eventsInRange, excludedIds],
  );
  const selectedEventIds = useMemo(() => selectedEventsList.map((e) => e.id), [selectedEventsList]);
  const selectedMapKey = useMemo(() => `${lang}:${selectedEventIds.join(',')}`, [lang, selectedEventIds]);

  // Universal auto-sync for Card 01: renders the exact website 2D MapLibre Positron map
  // directly in the user's browser (works on iPhone, Android, Desktop, Vercel — zero Playwright needed!).
  useEffect(() => {
    if (manualCoverMap || selectedEventsList.length === 0) return;
    if (capturedMapKey === selectedMapKey && coverMapSnapshotDataUrl) return;

    let cancelled = false;
    const timer = setTimeout(async () => {
      setCapturingTarget('map');
      try {
        const dataUrl = await renderClientMapSnapshot(selectedEventsList, lang);
        if (!cancelled && dataUrl) {
          setCoverMapSnapshotDataUrl(dataUrl);
          setCapturedMapKey(selectedMapKey);
        }
      } catch {
        // Fallback to server Playwright capture if local environment has it and WebGL is unavailable
        if (!cancelled && envStatus.rendererAvailable) {
          try {
            const res = await fetch('/api/admin/capture-site', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                target: 'map',
                lang,
                startDate,
                endDate,
                selectedIds: selectedEventIds,
              }),
            });
            const data = await res.json();
            if (!cancelled && data.ok && data.dataUrl) {
              setCoverMapSnapshotDataUrl(data.dataUrl);
              setCapturedMapKey(selectedMapKey);
            }
          } catch {
            // keep SVG fallback
          }
        }
      } finally {
        if (!cancelled) {
          setCapturingTarget((cur) => (cur === 'map' ? null : cur));
        }
      }
    }, 450);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    manualCoverMap,
    selectedMapKey,
    capturedMapKey,
    coverMapSnapshotDataUrl,
    selectedEventsList,
    selectedEventIds,
    envStatus.rendererAvailable,
    lang,
    startDate,
    endDate,
  ]);

  const activePickIds = useMemo(() => {
    const selectedSet = new Set(selectedEventIds);
    return pickIds.filter((id) => selectedSet.has(id));
  }, [pickIds, selectedEventIds]);

  // Generate live Diagramme XHS Life pack
  const pack = useMemo(() => {
    return generateXhsLifePack(allEvents, {
      startDate,
      endDate,
      kicker,
      footerTopic,
      coverTitle,
      coverIntro,
      siteUrl,
      searchKeywords,
      selectedEventIds,
      pickEventIds: activePickIds,
      audienceNotes,
      customPosters,
      coverMapSnapshotDataUrl,
      card3StatHighlight,
      card4Title,
      card4Intro,
      card4Point1Title,
      card4Point1Body,
      card4Point2Title,
      card4Point2Body,
      card4ScreenshotDataUrl,
      includeOverflowChecklist,
      exceptionReason,
      cardHtmlOverrides,
    });
  }, [
    allEvents,
    startDate,
    endDate,
    kicker,
    footerTopic,
    coverTitle,
    coverIntro,
    siteUrl,
    searchKeywords,
    selectedEventIds,
    activePickIds,
    audienceNotes,
    customPosters,
    coverMapSnapshotDataUrl,
    card3StatHighlight,
    card4Title,
    card4Intro,
    card4Point1Title,
    card4Point1Body,
    card4Point2Title,
    card4Point2Body,
    card4ScreenshotDataUrl,
    includeOverflowChecklist,
    exceptionReason,
    cardHtmlOverrides,
  ]);

  const safePageIdx = Math.min(activePageIdx, Math.max(0, pack.cards.length - 1));
  const currentCard = pack.cards[safePageIdx];
  const captionValue = captionOverride ?? pack.captionMd;
  const footerViolations = useMemo(() => checkFooterTopic(footerTopic), [footerTopic]);

  const friendGeoPreview = useMemo(() => {
    if (friendForm.isOnline || (!friendForm.venue.trim() && !friendForm.address.trim() && friendForm.lat == null)) return null;
    const dummy = {
      id: 'preview',
      title: friendForm.title || 'preview',
      startAt: new Date().toISOString(),
      venue: friendForm.venue,
      address: friendForm.address,
      lat: friendForm.lat ?? null,
      lng: friendForm.lng ?? null,
      url: '',
      organiser: '',
      isFree: true,
      status: 'open',
      isOnline: false,
      tags: [],
      sourceIds: [],
      companyIds: [],
      firstSeen: '',
    } as SgEvent;
    return resolveEventGeo(dummy);
  }, [friendForm.isOnline, friendForm.venue, friendForm.address, friendForm.lat, friendForm.lng, friendForm.title]);

  // ── Handlers ──
  function applyPreset(kind: '7d' | 'sun2sun' | '14d' | '30d') {
    if (kind === '7d') {
      setStartDate(defaultStartDate);
      setEndDate(addDaysYmd(defaultStartDate, 6));
    } else if (kind === 'sun2sun') {
      const [s, e] = nextSundayToSunday(defaultStartDate);
      setStartDate(s);
      setEndDate(e);
    } else if (kind === '14d') {
      setStartDate(defaultStartDate);
      setEndDate(addDaysYmd(defaultStartDate, 13));
    } else {
      setStartDate(defaultStartDate);
      setEndDate(addDaysYmd(defaultStartDate, 29));
    }
    setRenderedPages([]);
  }

  function toggleInclude(id: string) {
    setExcludedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function togglePick(id: string) {
    setPickIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 3) return [...prev.slice(1), id];
      return [...prev, id];
    });
  }

  function handleUploadEventPoster(eventId: string, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setCustomPosters((prev) => ({ ...prev, [eventId]: reader.result as string }));
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  function selectAllVisible() {
    setExcludedIds((prev) => {
      const next = new Set(prev);
      visibleRangeEvents.forEach((e) => next.delete(e.id));
      return next;
    });
  }

  function clearAllVisible() {
    setExcludedIds((prev) => {
      const next = new Set(prev);
      visibleRangeEvents.forEach((e) => next.add(e.id));
      return next;
    });
  }

  function persistLocalFriends(items: XhsEventItem[]) {
    try {
      localStorage.setItem(LOCAL_FRIEND_KEY, JSON.stringify(items));
    } catch {
      // ignore
    }
  }

  // Shared save helper used by both Manual Form Submit and One-Click Smart Import
  async function saveFriendPayload(formState: FriendFormState): Promise<{
    ok: boolean;
    storageMode: 'file' | 'readonly';
    savedEvent?: XhsEventItem;
    error?: string;
  }> {
    const payload = {
      id: formState.id,
      title: formState.title.trim(),
      startAt: toSgtIso(formState.date, formState.startTime),
      endAt: formState.endTime ? toSgtIso(formState.date, formState.endTime) : null,
      organiser: formState.organiser.trim() || '朋友社群',
      isOnline: formState.isOnline,
      venue: formState.venue.trim(),
      address: formState.address.trim(),
      lat: formState.lat ?? null,
      lng: formState.lng ?? null,
      url: formState.url.trim(),
      coverImageUrl: formState.coverImageUrl ?? null,
      isFree: formState.isFree,
      price: formState.isFree ? null : formState.price.trim() || null,
      status: formState.status,
      friendNote: formState.friendNote.trim(),
      publishToSite: formState.publishToSite,
    };

    const res = await fetch('/api/admin/friend-events', {
      method: formState.id ? 'PUT' : 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(adminToken ? { 'x-admin-token': adminToken } : {}),
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      return { ok: false, storageMode: 'file', error: data.error || 'Save failed' };
    }

    const savedList: XhsEventItem[] = (data.events ?? []).map((item: SgEvent) => {
      const geo = resolveEventGeo(item);
      return {
        ...item,
        isFriendEvent: true,
        mrtLabel:
          geo?.precision === 'area' && geo.areaLabel
            ? `${geo.areaLabel} 区域`
            : geo?.mrtName
              ? `${geo.mrtName} 站`
              : undefined,
      };
    });

    setFriendEvents(savedList);
    persistLocalFriends(savedList);
    const mode = data.storageMode === 'readonly' ? 'readonly' : 'file';
    setStorageMode(mode);

    const savedEvent = savedList.find((x) => x.id === data.event?.id);
    if (savedEvent) {
      setExcludedIds((prev) => {
        const next = new Set(prev);
        next.delete(savedEvent.id);
        return next;
      });
      setPickIds((prev) => (prev.includes(savedEvent.id) ? prev : [savedEvent.id, ...prev].slice(0, 3)));
      const fDay = sgDateKey(savedEvent.startAt);
      if (fDay < startDate) setStartDate(fDay);
      if (fDay > endDate) setEndDate(fDay);
    }

    return { ok: true, storageMode: mode, savedEvent };
  }

  async function handleSaveFriendEvent(ev: React.FormEvent) {
    ev.preventDefault();
    if (!friendForm.title.trim()) {
      setFriendFeedback(isZh ? '请填写活动原名' : 'Please enter an event title.');
      return;
    }
    setSavingFriend(true);
    setFriendFeedback(null);
    try {
      const result = await saveFriendPayload(friendForm);
      if (!result.ok) throw new Error(result.error);
      setFriendForm(emptyFriendForm(startDate));
      setFriendFeedback(
        result.storageMode === 'readonly'
          ? isZh
            ? '已保存到浏览器本地（只读环境可导出 friend_events.json 提交仓库）。'
            : 'Saved to browser storage (read-only FS).'
          : isZh
            ? '已写入 data/friend_events.json，并自动纳入本次导出与主推列表。'
            : 'Saved to data/friend_events.json and added to the deck.',
      );
    } catch (err) {
      setFriendFeedback(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSavingFriend(false);
    }
  }

  function attachSmartImage(file: File) {
    if (!file.type.startsWith('image/')) return;
    setSmartImageFile(file);
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') setSmartImagePreview(reader.result);
    };
    reader.readAsDataURL(file);
  }

  function clearSmartImage() {
    setSmartImageFile(null);
    setSmartImagePreview(null);
  }

  async function handleSmartParse(autoImport: boolean) {
    if (!smartInput.trim() && !smartImageFile) {
      setSmartStatus({
        kind: 'warn',
        message: isZh ? '请先粘贴活动链接、微信/WhatsApp 文案，或拖入/粘贴一张活动海报图片。' : 'Paste a link/text or attach a poster image first.',
      });
      return;
    }
    setSmartParsing(true);
    setSmartStatus(null);
    setFriendFeedback(null);

    try {
      const fd = new FormData();
      const trimmed = smartInput.trim();
      if (/^https?:\/\/\S+$/i.test(trimmed)) {
        fd.append('url', trimmed);
      } else if (trimmed) {
        fd.append('text', trimmed);
      }
      fd.append('fallbackDate', startDate);
      if (smartImageFile) {
        fd.append('image', smartImageFile);
      }

      const res = await fetch('/api/admin/parse-event', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || '解析失败');
      }

      const d = data.draft || {};
      const nextForm: FriendFormState = {
        ...emptyFriendForm(startDate),
        title: d.title || '',
        date: d.date || startDate,
        startTime: d.startTime || '19:00',
        endTime: d.endTime || '21:00',
        organiser: d.organiser || '',
        isOnline: Boolean(d.isOnline),
        venue: d.venue || '',
        address: d.address || '',
        lat: d.lat ?? null,
        lng: d.lng ?? null,
        url: d.url || '',
        coverImageUrl: d.coverImageUrl ?? null,
        isFree: d.isFree !== false,
        price: d.price || '',
        status: d.status || 'open',
        friendNote: d.friendNote || '',
        publishToSite: friendForm.publishToSite,
      };

      // If one-click import was requested AND both title + date were extracted cleanly -> save immediately!
      if (autoImport && data.readyForOneClick && nextForm.title && d.date) {
        const saved = await saveFriendPayload(nextForm);
        if (!saved.ok) throw new Error(saved.error || '自动保存失败');
        if (saved.savedEvent && !saved.savedEvent.coverImageUrl && smartImagePreview) {
          setCustomPosters((prev) => ({ ...prev, [saved.savedEvent!.id]: smartImagePreview }));
        }
        setSmartInput('');
        clearSmartImage();
        setFriendForm(emptyFriendForm(startDate));
        setSmartStatus({
          kind: 'ok',
          message: isZh
            ? `⚡ 已一键导入「${nextForm.title}」（${nextForm.date} ${nextForm.startTime}）并自动加入图 01 地图与图 03 主推！`
            : `Imported "${nextForm.title}" and added to Map & Featured Picks!`,
          sources: data.sourcesUsed,
          rawOcrText: data.rawOcrText,
        });
        return;
      }

      // Otherwise populate form for quick user confirmation
      setFriendForm(nextForm);
      const warns: string[] = [...(data.warnings ?? [])];
      if (autoImport && data.missingFields?.length) {
        warns.unshift(`未能自动确认「${data.missingFields.join('、')}」，已先填入其余字段，请核对后点击下方按钮保存。`);
      }
      setSmartStatus({
        kind: warns.length ? 'warn' : 'ok',
        message: warns.length
          ? warns.join(' ')
          : isZh
            ? `已自动填充表单（来源：${(data.sourcesUsed || []).join(' + ') || '智能提取'}），核对无误后点击下方保存。`
            : `Form filled via ${(data.sourcesUsed || []).join(' + ')}. Review and save below.`,
        sources: data.sourcesUsed,
        rawOcrText: data.rawOcrText,
      });
    } catch (err) {
      setSmartStatus({
        kind: 'err',
        message: err instanceof Error ? err.message : '解析失败',
      });
    } finally {
      setSmartParsing(false);
    }
  }

  async function handleDeleteFriendEvent(id: string) {
    setFriendFeedback(null);
    try {
      const res = await fetch(`/api/admin/friend-events?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: adminToken ? { 'x-admin-token': adminToken } : undefined,
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Delete failed');
      const nextList = friendEvents.filter((f) => f.id !== id);
      setFriendEvents(nextList);
      persistLocalFriends(nextList);
      setPickIds((prev) => prev.filter((x) => x !== id));
      setFriendFeedback(isZh ? '已删除该朋友活动。' : 'Friend event deleted.');
    } catch (err) {
      setFriendFeedback(err instanceof Error ? err.message : 'Delete failed');
    }
  }

  function handleEditFriendEvent(item: XhsEventItem) {
    const day = sgDateKey(item.startAt);
    const fmtHm = (iso: string) =>
      new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Singapore' }).format(
        new Date(iso),
      );
    setFriendForm({
      id: item.id,
      title: item.title,
      date: day,
      startTime: fmtHm(item.startAt),
      endTime: item.endAt ? fmtHm(item.endAt) : '',
      organiser: item.organiser,
      isOnline: item.isOnline,
      venue: item.venue,
      address: item.address,
      lat: item.lat ?? null,
      lng: item.lng ?? null,
      url: item.url,
      coverImageUrl: null,
      isFree: item.isFree !== false,
      price: item.price ?? '',
      status: item.status,
      friendNote: item.friendNote ?? '',
      publishToSite: Boolean(item.publishToSite),
    });
    setActiveTab('friends');
  }

  async function handleImportFriendsJson(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const list = Array.isArray(parsed) ? parsed : parsed?.events;
      if (!Array.isArray(list)) throw new Error('JSON 必须是活动数组');
      const res = await fetch('/api/admin/friend-events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(adminToken ? { 'x-admin-token': adminToken } : {}),
        },
        body: JSON.stringify({ events: list }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Import failed');
      setFriendEvents(data.events ?? []);
      persistLocalFriends(data.events ?? []);
      setStorageMode(data.storageMode === 'readonly' ? 'readonly' : 'file');
      setFriendFeedback(isZh ? `已批量导入 ${data.importedCount} 场朋友活动。` : `Imported ${data.importedCount} friend events.`);
    } catch (err) {
      setFriendFeedback(err instanceof Error ? err.message : 'Invalid JSON file');
    } finally {
      e.target.value = '';
    }
  }

  async function handleCaptureSite(target: 'map' | 'gonogo') {
    setCapturingTarget(target);
    setRenderError(null);
    try {
      // Map capture runs natively in the browser via MapLibre WebGL (works on Mobile + Vercel + Mac!)
      if (target === 'map') {
        try {
          const dataUrl = await renderClientMapSnapshot(selectedEventsList, lang);
          setCoverMapSnapshotDataUrl(dataUrl);
          setManualCoverMap(false);
          setCapturedMapKey(selectedMapKey);
          setActivePageIdx(0);
          return;
        } catch {
          // fall through to server Playwright capture if available
        }
      }

      const res = await fetch('/api/admin/capture-site', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target,
          lang,
          startDate,
          endDate,
          selectedIds: selectedEventIds,
        }),
      });
      const data = await res.json();
      if (!data.ok || !data.dataUrl) {
        setRenderError(data.error || '网页截图失败');
        return;
      }
      if (target === 'map') {
        setCoverMapSnapshotDataUrl(data.dataUrl);
        setManualCoverMap(false);
        setCapturedMapKey(selectedMapKey);
        setActivePageIdx(0);
      } else {
        setCard4ScreenshotDataUrl(data.dataUrl);
        setActivePageIdx(Math.max(0, pack.cards.length - 2));
      }
    } catch (err) {
      setRenderError(err instanceof Error ? err.message : '截图失败');
    } finally {
      setCapturingTarget(null);
    }
  }

  function handleUploadImageToSlot(e: React.ChangeEvent<HTMLInputElement>, slot: 'map' | 'card4') {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        if (slot === 'map') {
          setCoverMapSnapshotDataUrl(reader.result);
          setManualCoverMap(true);
          setActivePageIdx(0);
        } else {
          setCard4ScreenshotDataUrl(reader.result);
          setActivePageIdx(3);
        }
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  async function handleRenderPngPack(saveToDisk: boolean) {
    setRendering(true);
    setRenderError(null);
    setSavedDiskDir(null);
    setRenderProgress(null);
    try {
      // 1. Ensure Card 01 has an up-to-date real 2D MapLibre map snapshot (works on Mobile + Vercel + Mac!)
      let freshMapUrl = coverMapSnapshotDataUrl;
      if (!manualCoverMap && selectedEventsList.length > 0 && (capturedMapKey !== selectedMapKey || !freshMapUrl)) {
        setRenderProgress(isZh ? '正在生成 2D 实景地图…' : 'Rendering 2D map…');
        try {
          freshMapUrl = await renderClientMapSnapshot(selectedEventsList, lang);
          setCoverMapSnapshotDataUrl(freshMapUrl);
          setCapturedMapKey(selectedMapKey);
        } catch {
          // continue with existing map
        }
      }

      const buildPack = (proxyImages: boolean) =>
        generateXhsLifePack(allEvents, {
          startDate,
          endDate,
          kicker,
          footerTopic,
          coverTitle,
          coverIntro,
          siteUrl,
          searchKeywords,
          selectedEventIds,
          pickEventIds: activePickIds,
          audienceNotes,
          customPosters,
          coverMapSnapshotDataUrl: freshMapUrl,
          card3StatHighlight,
          card4Title,
          card4Intro,
          card4Point1Title,
          card4Point1Body,
          card4Point2Title,
          card4Point2Body,
          card4ScreenshotDataUrl,
          includeOverflowChecklist,
          proxyExternalImages: proxyImages,
          exceptionReason,
          cardHtmlOverrides,
        });

      // 2. Local Mac/Node with Playwright -> render via Playwright & save full folder to exports/
      if (envStatus.rendererAvailable) {
        const activePack = buildPack(false);
        setRenderProgress(isZh ? `正在 Playwright 渲染 ${activePack.cards.length} 张 PNG…` : 'Rendering via Playwright…');
        const res = await fetch('/api/admin/export-pack', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(adminToken ? { 'x-admin-token': adminToken } : {}),
          },
          body: JSON.stringify({
            packSlug: activePack.packSlug,
            cards: activePack.cards.map((c) => ({
              pageNumber: c.pageNumber,
              filename: c.filename,
              pngFilename: c.pngFilename,
              html: c.html,
            })),
            captionMd: captionOverride ?? activePack.captionMd,
            usageJson: activePack.usageJson,
            saveToDisk,
          }),
        });
        const data = await res.json();
        if (data.ok) {
          setRenderedPages(data.pages ?? []);
          setSavedDiskDir(data.savedDir ?? null);
          return;
        }
      }

      // 3. Vercel / Mobile / Browser-native PNG renderer (zero Playwright required!)
      const browserPack = buildPack(true);
      const outPages: RenderedPageResult[] = [];
      for (let i = 0; i < browserPack.cards.length; i++) {
        const c = browserPack.cards[i];
        setRenderProgress(
          isZh
            ? `正在浏览器生成 1080×1440 PNG（${i + 1} / ${browserPack.cards.length}）…`
            : `Rendering PNG ${i + 1} / ${browserPack.cards.length}…`,
        );
        const rendered = await renderCardHtmlToPngClient({
          pageNumber: c.pageNumber,
          filename: c.filename,
          pngFilename: c.pngFilename,
          html: c.html,
        });
        outPages.push(rendered);
      }
      setRenderedPages(outPages);
    } catch (err) {
      setRenderError(err instanceof Error ? err.message : 'Export request failed.');
    } finally {
      setRendering(false);
      setRenderProgress(null);
    }
  }

  function handleDownloadAllHtml() {
    pack.cards.forEach((c, idx) => {
      setTimeout(() => downloadTextFile(c.filename, c.html, 'text/html;charset=utf-8'), idx * 140);
    });
    setTimeout(() => downloadTextFile('caption.md', captionValue, 'text/markdown;charset=utf-8'), pack.cards.length * 140 + 80);
    setTimeout(() => downloadTextFile('diagramme-usage.json', pack.usageJson, 'application/json;charset=utf-8'), pack.cards.length * 140 + 220);
  }

  function handleDownloadAllPngs() {
    renderedPages.forEach((p, idx) => {
      setTimeout(() => downloadDataUrl(p.pngFilename, p.pngDataUrl), idx * 160);
    });
  }

  async function handleCopyCaption() {
    try {
      await navigator.clipboard.writeText(captionValue);
      setCopiedCaption(true);
      setTimeout(() => setCopiedCaption(false), 1800);
    } catch {
      // ignore
    }
  }

  const scale = previewWidth / 1080;
  const scaledHeight = Math.round(1440 * scale);
  const currentRendered = renderedPages.find((p) => p.pageNumber === currentCard?.pageNumber);

  return (
    <div className="space-y-6">
      {/* Top Studio Header & Honest Boundary Banner */}
      <section className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-full bg-[#141414] px-3 py-0.5 text-xs font-bold tracking-wide text-white">
                人在坡岛
              </span>
              <span className="badge badge-primary">Diagramme Life · 1080 × 1440</span>
              <span className="badge">
                {isZh ? '仅生成图文 + 配文 + 审阅 · 不自动发布小红书' : 'Generate + Caption + Review only · No auto-publish'}
              </span>
            </div>
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
              {isZh ? '小红书 Life 图文导出后台 & 朋友活动管理' : 'XHS Life Export Admin & Friend Events'}
            </h1>
            <p className="max-w-3xl text-[13px] text-muted">
              {isZh
                ? '图 1 联动地图 · 图 2 人群/兴趣总览 · 图 3 统计与主推 · 图 4 网站主办方直连与 GO/NOGO · 图 5 四大功能指南与二维码。支持链接、文案、海报图片一键导入朋友活动。'
                : 'Card 1 Linked Map · Card 2 Audience Overview · Card 3 Stats & Picks · Card 4 Site & GO/NOGO · Card 5 4-Feature Guide & QR. Smart URL/Text/Poster import.'}
            </p>
          </div>

          <div className="flex flex-col items-start gap-2 sm:items-end">
            {envStatus.checked && (
              <span className="badge border-emerald-200 bg-emerald-50 text-emerald-800">
                {envStatus.rendererAvailable
                  ? isZh
                    ? '本机 Playwright + 2D 地图就绪 · 支持一键出图并存盘'
                    : 'Local Playwright + 2D map ready · 1-click PNG & save'
                  : isZh
                    ? '手机 / 浏览器引擎就绪 · 支持实景 2D 地图与一键导出 PNG'
                    : 'Mobile / Browser engine ready · 2D map & 1080×1440 PNG'}
              </span>
            )}
            {envStatus.authRequired && (
              <input
                type="password"
                value={adminToken}
                onChange={(e) => setAdminToken(e.target.value)}
                placeholder={isZh ? '输入后台写盘口令 (ADMIN_PASSWORD)' : 'Admin passcode'}
                className="input h-8 w-56 text-xs"
              />
            )}
          </div>
        </div>
      </section>

      {/* Main 2-Column Workbench */}
      <div className="grid gap-6 lg:grid-cols-[460px_minmax(0,1fr)] xl:grid-cols-[490px_minmax(0,1fr)]">
        {/* ════════════ LEFT COLUMN: Controls & Curation ════════════ */}
        <div className="space-y-4">
          {/* Mode Tabs */}
          <div className="tabs grid w-full grid-cols-3">
            <button
              type="button"
              className="tab justify-center text-xs sm:text-[13px]"
              aria-pressed={activeTab === 'events'}
              onClick={() => setActiveTab('events')}
            >
              {isZh ? `1. 日期选活动 (${selectedEventIds.length})` : `1. Events (${selectedEventIds.length})`}
            </button>
            <button
              type="button"
              className="tab justify-center text-xs sm:text-[13px]"
              aria-pressed={activeTab === 'friends'}
              onClick={() => setActiveTab('friends')}
            >
              {isZh ? `2. 朋友活动 (${friendEvents.length})` : `2. Friends (${friendEvents.length})`}
            </button>
            <button
              type="button"
              className="tab justify-center text-xs sm:text-[13px]"
              aria-pressed={activeTab === 'style'}
              onClick={() => setActiveTab('style')}
            >
              {isZh ? '3. 版式与截图' : '3. Deck & Shots'}
            </button>
          </div>

          {/* ── TAB 1: Date Range & Event Curation ── */}
          {activeTab === 'events' && (
            <section className="card space-y-4 p-4">
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold">{isZh ? '选择活动日期范围（SGT）' : 'Event Date Window (SGT)'}</h2>
                  <span className="text-xs text-muted tabular-nums">
                    {isZh ? `范围内 ${eventsInRange.length} 场 · 已选 ${selectedEventIds.length} 场` : `${selectedEventIds.length}/${eventsInRange.length} selected`}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="space-y-1 text-xs text-muted">
                    <span>{isZh ? '开始日期' : 'Start date'}</span>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => {
                        setStartDate(e.target.value);
                        setRenderedPages([]);
                      }}
                      className="input h-9 text-xs tabular-nums"
                    />
                  </label>
                  <label className="space-y-1 text-xs text-muted">
                    <span>{isZh ? '结束日期' : 'End date'}</span>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => {
                        setEndDate(e.target.value);
                        setRenderedPages([]);
                      }}
                      className="input h-9 text-xs tabular-nums"
                    />
                  </label>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" className="btn btn-sm !h-7 !px-2.5 !text-xs" onClick={() => applyPreset('7d')}>
                    {isZh ? '未来 7 天' : 'Next 7d'}
                  </button>
                  <button type="button" className="btn btn-sm !h-7 !px-2.5 !text-xs" onClick={() => applyPreset('sun2sun')}>
                    {isZh ? '周日→周日（周报窗口）' : 'Sun–Sun window'}
                  </button>
                  <button type="button" className="btn btn-sm !h-7 !px-2.5 !text-xs" onClick={() => applyPreset('14d')}>
                    {isZh ? '未来 14 天' : 'Next 14d'}
                  </button>
                  <button type="button" className="btn btn-sm !h-7 !px-2.5 !text-xs" onClick={() => applyPreset('30d')}>
                    {isZh ? '未来 30 天' : 'Next 30d'}
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] pt-3">
                <div className="flex flex-wrap gap-1">
                  {(['all', 'friends', 'hiring', 'free'] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setEventFilter(f)}
                      className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
                        eventFilter === f
                          ? 'border-[var(--foreground)] bg-[var(--foreground)] text-white'
                          : 'border-[var(--border)] bg-white text-muted hover:bg-[var(--muted)]'
                      }`}
                    >
                      {f === 'all'
                        ? isZh ? '全部' : 'All'
                        : f === 'friends'
                          ? isZh ? '朋友主办' : 'Friends'
                          : f === 'hiring'
                            ? isZh ? '在招公司' : 'Hiring'
                            : isZh ? '免费' : 'Free'}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2 text-xs">
                  <button type="button" className="link" onClick={selectAllVisible}>
                    {isZh ? '全选' : 'All'}
                  </button>
                  <button type="button" className="text-muted hover:underline" onClick={clearAllVisible}>
                    {isZh ? '清空' : 'Clear'}
                  </button>
                </div>
              </div>

              {/* Event list */}
              <div className="max-h-[590px] space-y-2 overflow-y-auto pr-1">
                {visibleRangeEvents.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-[var(--border)] p-6 text-center text-xs text-muted">
                    <p>{isZh ? '当前日期与筛选条件下没有活动。' : 'No events match this date window and filter.'}</p>
                    <button type="button" className="btn btn-sm mt-3" onClick={() => setActiveTab('friends')}>
                      {isZh ? '+ 去智能导入朋友活动' : '+ Smart-import a friend event'}
                    </button>
                  </div>
                ) : (
                  visibleRangeEvents.map((e) => {
                    const included = !excludedIds.has(e.id);
                    const starred = activePickIds.includes(e.id);
                    const inferred = inferAudienceFit(e);
                    const noteVal = audienceNotes[e.id] ?? e.friendNote ?? '';
                    return (
                      <div
                        key={e.id}
                        className={`rounded-lg border p-3 transition-colors ${
                          included ? 'border-[var(--border)] bg-white' : 'border-dashed border-[var(--border)] bg-[var(--muted)]/50 opacity-65'
                        }`}
                      >
                        <div className="flex items-start gap-2.5">
                          <input
                            type="checkbox"
                            checked={included}
                            onChange={() => toggleInclude(e.id)}
                            aria-label={e.title}
                            className="mt-1 h-4 w-4 shrink-0 accent-[#1257fd]"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
                              <span className="font-medium text-[var(--foreground)] tabular-nums">{fmtShortDayTime(e.startAt)}</span>
                              {e.isFriendEvent && (
                                <span className="rounded-full bg-[#141414] px-2 py-0.5 text-[10px] font-semibold text-white">
                                  {isZh ? '朋友主办' : 'Friend'}
                                </span>
                              )}
                              {e.hiringCompanyNames && e.hiringCompanyNames.length > 0 && (
                                <span className="badge badge-primary !h-4 !px-1.5 !text-[10px]">
                                  {isZh ? '在招' : 'Hiring'}
                                </span>
                              )}
                              {e.status === 'sold_out' && <span className="badge !h-4 !px-1.5 !text-[10px]">{isZh ? '已满' : 'Full'}</span>}
                              {e.status === 'approval' && <span className="badge !h-4 !px-1.5 !text-[10px]">{isZh ? '需审核' : 'Approval'}</span>}
                            </div>
                            <p className="mt-1 text-[13px] font-medium leading-snug">{e.title}</p>
                            <p className="mt-0.5 truncate text-[11px] text-muted">
                              {e.mrtLabel || e.venue || (isZh ? '地址报名后公开' : 'Address TBA')}
                              {e.organiser ? ` · ${e.organiser}` : ''}
                            </p>
                          </div>
                          {included && (
                            <button
                              type="button"
                              onClick={() => togglePick(e.id)}
                              title={isZh ? '加入图 03 重点主推（最多 3 场，带展板图）' : 'Feature on Card 03 (1–3 picks with poster)'}
                              className={`shrink-0 rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
                                starred
                                  ? 'border-[#141414] bg-[#141414] text-white'
                                  : 'border-[var(--border)] bg-white text-muted hover:text-[var(--foreground)]'
                              }`}
                            >
                              {starred ? '★ 主推' : '☆ 主推'}
                            </button>
                          )}
                        </div>
                        {included && (
                          <div className="mt-2 space-y-1.5 pl-6">
                            <input
                              type="text"
                              value={noteVal}
                              onChange={(ev) =>
                                setAudienceNotes((prev) => ({ ...prev, [e.id]: ev.target.value }))
                              }
                              placeholder={
                                isZh
                                  ? `默认「${inferred.audience}」· 可自定义适合人群/活动看点`
                                  : `Default: ${inferred.audience}`
                              }
                              className="input h-7 text-[11px]"
                            />
                            {starred && (
                              <div className="flex items-center justify-between gap-2 rounded-md border border-[var(--border)] bg-[var(--muted)]/40 px-2 py-1 text-[11px]">
                                <div className="flex items-center gap-2 min-w-0">
                                  {(customPosters[e.id] || e.coverImageUrl) ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                      src={customPosters[e.id] || e.coverImageUrl || ''}
                                      alt="poster"
                                      className="h-7 w-7 rounded object-cover border border-[var(--border)] shrink-0"
                                    />
                                  ) : (
                                    <span className="grid h-7 w-7 place-items-center rounded bg-[#231F20] text-[9px] font-bold text-white shrink-0">
                                      图
                                    </span>
                                  )}
                                  <span className="truncate text-muted">
                                    {customPosters[e.id]
                                      ? isZh ? '已使用自定义展板' : 'Custom poster'
                                      : e.coverImageUrl
                                        ? isZh ? '已自动带入活动官方展板' : 'Official poster loaded'
                                        : isZh ? '暂无展板图（使用版式徽章）' : 'No poster yet'}
                                  </span>
                                </div>
                                <div className="flex shrink-0 items-center gap-2">
                                  <label className="link cursor-pointer">
                                    {isZh ? '换展板图' : 'Poster'}
                                    <input
                                      type="file"
                                      accept="image/*"
                                      onChange={(ev) => handleUploadEventPoster(e.id, ev)}
                                      className="hidden"
                                    />
                                  </label>
                                  {customPosters[e.id] && (
                                    <button
                                      type="button"
                                      className="text-red-600 hover:underline"
                                      onClick={() =>
                                        setCustomPosters((prev) => {
                                          const next = { ...prev };
                                          delete next[e.id];
                                          return next;
                                        })
                                      }
                                    >
                                      {isZh ? '还原' : 'Reset'}
                                    </button>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </section>
          )}

          {/* ── TAB 2: Smart One-Click Import & Friend Events Backend ── */}
          {activeTab === 'friends' && (
            <section className="card space-y-4 p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold">{isZh ? '智能一键导入朋友活动' : 'Smart Import Friend Events'}</h2>
                  <p className="mt-0.5 text-xs text-muted">
                    {isZh
                      ? '支持粘贴活动链接（Luma/Eventbrite/微信）、转发文案、或拖入/Cmd+V 粘贴海报截图。'
                      : 'Paste an event URL, message text, or drop/paste (Cmd+V) a poster screenshot.'}
                  </p>
                </div>
                <span className="badge text-[11px]">
                  {storageMode === 'readonly' ? (isZh ? '本地存储' : 'Browser') : 'friend_events.json'}
                </span>
              </div>

              {/* Unified Smart Dropzone (URL + Text + Image OCR) */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDraggingImg(true);
                }}
                onDragLeave={() => setIsDraggingImg(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDraggingImg(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f && f.type.startsWith('image/')) attachSmartImage(f);
                }}
                className={`rounded-xl border-2 border-dashed p-3.5 space-y-3 transition-colors ${
                  isDraggingImg
                    ? 'border-[var(--primary)] bg-[var(--primary-soft)]/50'
                    : 'border-[var(--border)] bg-[var(--muted)]/45'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-1.5 text-[11px]">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="badge !h-5 !text-[10px]">🔗 链接解析 ✓</span>
                    <span className="badge !h-5 !text-[10px]">📝 文字提取 ✓</span>
                    <span
                      className={`badge !h-5 !text-[10px] ${
                        parseCaps.ocrAvailable ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : ''
                      }`}
                    >
                      {parseCaps.checked
                        ? parseCaps.ocrAvailable
                          ? '🖼 海报 OCR (Vision) ✓'
                          : '🖼 本机无 OCR'
                        : '🖼 检查 OCR…'}
                    </span>
                  </div>
                  <label className="link cursor-pointer text-xs font-medium">
                    {isZh ? '+ 上传海报/截图' : '+ Attach Poster'}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) attachSmartImage(f);
                        e.target.value = '';
                      }}
                      className="hidden"
                    />
                  </label>
                </div>

                <textarea
                  rows={3}
                  value={smartInput}
                  onChange={(e) => setSmartInput(e.target.value)}
                  onPaste={(e) => {
                    const items = e.clipboardData?.items;
                    if (!items) return;
                    for (let i = 0; i < items.length; i++) {
                      if (items[i].type.startsWith('image/')) {
                        const file = items[i].getAsFile();
                        if (file) {
                          e.preventDefault();
                          attachSmartImage(file);
                          break;
                        }
                      }
                    }
                  }}
                  placeholder={
                    isZh
                      ? '直接粘贴 Luma / Eventbrite / 公众号链接，或粘贴微信群活动文字；也可直接在此处按 Cmd+V 粘贴活动海报截图，或把图片拖进来…'
                      : 'Paste a Luma/Eventbrite URL or chat blurb, or press Cmd+V / drop an event poster image here…'
                  }
                  className="input h-auto w-full bg-white py-2 text-xs leading-relaxed"
                />

                {smartImagePreview && (
                  <div className="flex items-center gap-3 rounded-lg border border-[var(--border)] bg-white p-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={smartImagePreview}
                      alt="Attached poster"
                      className="h-14 w-14 rounded object-cover border border-[var(--border)]"
                    />
                    <div className="min-w-0 flex-1 text-xs">
                      <p className="truncate font-medium">{smartImageFile?.name || '剪贴板截图'}</p>
                      <p className="text-[11px] text-muted">
                        {isZh ? '已附带海报，点击下方按钮将自动 OCR 识别中英文信息' : 'Poster attached — click below to run Vision OCR'}
                      </p>
                    </div>
                    <button type="button" className="text-xs text-red-600 hover:underline" onClick={clearSmartImage}>
                      {isZh ? '移除' : 'Remove'}
                    </button>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={smartParsing}
                    onClick={() => handleSmartParse(true)}
                    className="btn btn-primary btn-sm !h-8 !text-xs"
                  >
                    {smartParsing ? (isZh ? '正在解析…' : 'Parsing…') : isZh ? '⚡ 一键解析并直接导入' : '⚡ Smart Parse & Import'}
                  </button>
                  <button
                    type="button"
                    disabled={smartParsing}
                    onClick={() => handleSmartParse(false)}
                    className="btn btn-sm !h-8 !text-xs"
                  >
                    {isZh ? '仅解析填表（先核对）' : 'Parse to Form'}
                  </button>
                </div>

                {smartStatus && (
                  <div
                    className={`rounded-md border p-2.5 text-xs ${
                      smartStatus.kind === 'ok'
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                        : smartStatus.kind === 'warn'
                          ? 'border-amber-200 bg-amber-50 text-amber-900'
                          : 'border-red-200 bg-red-50 text-red-900'
                    }`}
                  >
                    <p>{smartStatus.message}</p>
                    {smartStatus.rawOcrText && (
                      <details className="mt-1.5">
                        <summary className="cursor-pointer text-[11px] opacity-80">
                          {isZh ? '查看 OCR 识别原文' : 'Show OCR text'}
                        </summary>
                        <pre className="mt-1 max-h-28 overflow-auto whitespace-pre-wrap rounded bg-white/80 p-2 font-mono text-[10px]">
                          {smartStatus.rawOcrText}
                        </pre>
                      </details>
                    )}
                  </div>
                )}
              </div>

              {/* Manual / Reviewed Event Form */}
              <form onSubmit={handleSaveFriendEvent} className="space-y-3 border-t border-[var(--border)] pt-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold">
                    {friendForm.id ? (isZh ? '编辑朋友活动' : 'Edit Friend Event') : isZh ? '手动填写 / 核对解析结果' : 'Manual / Review Parsed Fields'}
                  </span>
                  {friendForm.title && (
                    <button
                      type="button"
                      className="text-[11px] text-muted hover:underline"
                      onClick={() => setFriendForm(emptyFriendForm(startDate))}
                    >
                      {isZh ? '清空表单' : 'Reset'}
                    </button>
                  )}
                </div>

                <label className="block space-y-1 text-xs">
                  <span className="font-medium">{isZh ? '活动名称（保留官方原名）*' : 'Event Title (original) *'}</span>
                  <input
                    type="text"
                    required
                    value={friendForm.title}
                    onChange={(e) => setFriendForm((f) => ({ ...f, title: e.target.value }))}
                    placeholder="e.g. Builders Coffee & Agent Demo Night"
                    className="input text-xs"
                  />
                </label>

                <div className="grid grid-cols-3 gap-2">
                  <label className="space-y-1 text-xs">
                    <span className="text-muted">{isZh ? '日期 (SGT)*' : 'Date *'}</span>
                    <input
                      type="date"
                      required
                      value={friendForm.date}
                      onChange={(e) => setFriendForm((f) => ({ ...f, date: e.target.value }))}
                      className="input text-xs tabular-nums"
                    />
                  </label>
                  <label className="space-y-1 text-xs">
                    <span className="text-muted">{isZh ? '开始时间*' : 'Start *'}</span>
                    <input
                      type="time"
                      required
                      value={friendForm.startTime}
                      onChange={(e) => setFriendForm((f) => ({ ...f, startTime: e.target.value }))}
                      className="input text-xs tabular-nums"
                    />
                  </label>
                  <label className="space-y-1 text-xs">
                    <span className="text-muted">{isZh ? '结束时间' : 'End'}</span>
                    <input
                      type="time"
                      value={friendForm.endTime}
                      onChange={(e) => setFriendForm((f) => ({ ...f, endTime: e.target.value }))}
                      className="input text-xs tabular-nums"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <label className="space-y-1 text-xs">
                    <span className="text-muted">{isZh ? '主办方 / 朋友社群' : 'Host / Community'}</span>
                    <input
                      type="text"
                      value={friendForm.organiser}
                      onChange={(e) => setFriendForm((f) => ({ ...f, organiser: e.target.value }))}
                      placeholder={isZh ? '例如：SG Indie Builders' : 'e.g. SG Indie Builders'}
                      className="input text-xs"
                    />
                  </label>
                  <label className="space-y-1 text-xs">
                    <span className="text-muted">{isZh ? '报名状态' : 'Status'}</span>
                    <select
                      value={friendForm.status}
                      onChange={(e) => setFriendForm((f) => ({ ...f, status: e.target.value as FriendFormState['status'] }))}
                      className="input text-xs"
                    >
                      <option value="open">{isZh ? '可报名' : 'Open'}</option>
                      <option value="approval">{isZh ? '需审核' : 'Approval'}</option>
                      <option value="waitlist">{isZh ? '候补' : 'Waitlist'}</option>
                      <option value="sold_out">{isZh ? '已满' : 'Sold out'}</option>
                    </select>
                  </label>
                </div>

                <div className="flex flex-wrap items-center gap-4 text-xs">
                  <label className="inline-flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={friendForm.isOnline}
                      onChange={(e) => setFriendForm((f) => ({ ...f, isOnline: e.target.checked }))}
                      className="accent-[#1257fd]"
                    />
                    <span>{isZh ? '线上活动' : 'Online'}</span>
                  </label>
                  <label className="inline-flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={friendForm.isFree}
                      onChange={(e) => setFriendForm((f) => ({ ...f, isFree: e.target.checked }))}
                      className="accent-[#1257fd]"
                    />
                    <span>{isZh ? '免费' : 'Free'}</span>
                  </label>
                  {!friendForm.isFree && (
                    <input
                      type="text"
                      value={friendForm.price}
                      onChange={(e) => setFriendForm((f) => ({ ...f, price: e.target.value }))}
                      placeholder="S$15"
                      className="input h-7 w-24 text-xs"
                    />
                  )}
                </div>

                {!friendForm.isOnline && (
                  <div className="grid grid-cols-2 gap-2">
                    <label className="space-y-1 text-xs">
                      <span className="text-muted">{isZh ? '场地名（支持地图联动）' : 'Venue'}</span>
                      <input
                        type="text"
                        value={friendForm.venue}
                        onChange={(e) => setFriendForm((f) => ({ ...f, venue: e.target.value }))}
                        placeholder="Lorong AI / One-North / Bugis"
                        className="input text-xs"
                      />
                    </label>
                    <label className="space-y-1 text-xs">
                      <span className="text-muted">{isZh ? '详细地址（可选）' : 'Full address'}</span>
                      <input
                        type="text"
                        value={friendForm.address}
                        onChange={(e) => setFriendForm((f) => ({ ...f, address: e.target.value }))}
                        placeholder="69 Ayer Rajah Cres, Singapore"
                        className="input text-xs"
                      />
                    </label>
                  </div>
                )}

                {friendGeoPreview && (
                  <p className="text-[11px] text-emerald-700">
                    ✓ {isZh ? '已自动定位上地图：' : 'Mapped geo: '}
                    {friendGeoPreview.mrtName
                      ? `${friendGeoPreview.mrtName} 站（步行约 ${friendGeoPreview.mrtWalkMins} 分钟）`
                      : friendGeoPreview.areaLabel || `${friendGeoPreview.lat.toFixed(3)}, ${friendGeoPreview.lng.toFixed(3)}`}
                  </p>
                )}

                <label className="block space-y-1 text-xs">
                  <span className="text-muted">{isZh ? '报名链接（可选）' : 'Registration URL'}</span>
                  <input
                    type="url"
                    value={friendForm.url}
                    onChange={(e) => setFriendForm((f) => ({ ...f, url: e.target.value }))}
                    placeholder="https://luma.com/..."
                    className="input text-xs"
                  />
                </label>

                <label className="block space-y-1 text-xs">
                  <span className="text-muted">{isZh ? '适合人群 / 主推理由（带入图 02 总览与图 03 主推）' : 'Audience fit / Curator note'}</span>
                  <input
                    type="text"
                    value={friendForm.friendNote}
                    onChange={(e) => setFriendForm((f) => ({ ...f, friendNote: e.target.value }))}
                    placeholder={isZh ? '例如：小范围拆解真实 Agent 项目，适合想认识一线开发者的人' : 'Small-group demo session for builders'}
                    className="input text-xs"
                  />
                </label>

                <label className="flex items-start gap-2 rounded-md border border-[var(--border)] bg-[var(--muted)]/40 p-2.5 text-xs">
                  <input
                    type="checkbox"
                    checked={friendForm.publishToSite}
                    onChange={(e) => setFriendForm((f) => ({ ...f, publishToSite: e.target.checked }))}
                    className="mt-0.5 accent-[#1257fd]"
                  />
                  <span>
                    <strong className="font-medium">{isZh ? '同步显示到公开网站（地图 / 活动页）' : 'Also publish to public site'}</strong>
                    <span className="block text-[11px] text-muted">
                      {isZh ? '默认不勾选：仅用于后台小红书导出，避免把私密朋友局放到公网。' : 'Unchecked by default: admin export only.'}
                    </span>
                  </span>
                </label>

                <div className="flex items-center gap-2">
                  <button type="submit" disabled={savingFriend} className="btn btn-primary btn-sm">
                    {savingFriend
                      ? isZh ? '保存中…' : 'Saving…'
                      : friendForm.id
                        ? isZh ? '更新朋友活动' : 'Update Event'
                        : isZh ? '+ 保存到后台活动库' : '+ Save Friend Event'}
                  </button>
                  {friendForm.id && (
                    <button type="button" className="btn btn-sm" onClick={() => setFriendForm(emptyFriendForm(startDate))}>
                      {isZh ? '取消编辑' : 'Cancel'}
                    </button>
                  )}
                </div>

                {friendFeedback && <p className="text-xs text-[var(--primary)]">{friendFeedback}</p>}
              </form>

              {/* Saved friend events list + JSON backup */}
              <div className="space-y-2 border-t border-[var(--border)] pt-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-xs font-semibold">
                    {isZh ? `已保存的朋友活动（${friendEvents.length}）` : `Saved Friend Events (${friendEvents.length})`}
                  </h3>
                  <div className="flex items-center gap-2 text-xs">
                    <button
                      type="button"
                      className="link"
                      onClick={() =>
                        downloadTextFile(
                          'friend_events.json',
                          `${JSON.stringify(friendEvents, null, 2)}\n`,
                          'application/json;charset=utf-8',
                        )
                      }
                    >
                      {isZh ? '导出 JSON' : 'Export JSON'}
                    </button>
                    <label className="link cursor-pointer">
                      {isZh ? '导入 JSON' : 'Import JSON'}
                      <input type="file" accept="application/json" onChange={handleImportFriendsJson} className="hidden" />
                    </label>
                  </div>
                </div>

                {friendEvents.length === 0 ? (
                  <p className="text-xs text-muted">{isZh ? '还没有导入朋友活动。用上方智能框粘贴链接、文案或海报即可一键导入。' : 'No friend events yet.'}</p>
                ) : (
                  <ul className="max-h-52 space-y-2 overflow-y-auto pr-1">
                    {friendEvents.map((f) => (
                      <li key={f.id} className="rounded-md border border-[var(--border)] p-2.5 text-xs">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-medium leading-snug">{f.title}</p>
                            <p className="mt-0.5 text-[11px] text-muted">
                              {fmtShortDayTime(f.startAt)} · {f.organiser} · {f.publishToSite ? (isZh ? '已公开到网站' : 'Public') : (isZh ? '仅后台导出' : 'Admin only')}
                            </p>
                          </div>
                          <div className="flex shrink-0 gap-1.5">
                            <button type="button" className="link text-[11px]" onClick={() => handleEditFriendEvent(f)}>
                              {isZh ? '编辑' : 'Edit'}
                            </button>
                            <button type="button" className="text-[11px] text-red-600 hover:underline" onClick={() => handleDeleteFriendEvent(f.id)}>
                              {isZh ? '删除' : 'Delete'}
                            </button>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          )}

          {/* ── TAB 3: Deck Copy, Screenshots, QR & Life Ratio ── */}
          {activeTab === 'style' && (
            <section className="card space-y-4 p-4">
              {/* Life Style Ratio Monitor */}
              <div className="rounded-lg border border-[var(--border)] bg-[var(--muted)]/50 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold">{isZh ? 'Diagramme Life 风格配比监控' : 'Diagramme Life Ratio Monitor'}</span>
                  <span
                    className={`badge !h-5 !text-[11px] ${
                      pack.ratio.matchesTarget ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'
                    }`}
                  >
                    {pack.ratio.matchesTarget ? (isZh ? '精准命中 40/20/40' : 'Exact 40/20/40') : (isZh ? '内容适配偏差（已记录）' : 'Content deviation noted')}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  {(['notionaly', 'diagram-design', 'hairline'] as DiagrammeStyle[]).map((st) => (
                    <div key={st} className="rounded-md border border-[var(--border)] bg-white p-2">
                      <p className="text-[11px] text-muted">{STYLE_LABELS[st]}</p>
                      <p className="mt-0.5 text-base font-bold tabular-nums">{pack.ratio.percents[st]}%</p>
                      <p className="text-[10px] text-muted">
                        {pack.ratio.counts[st]}/{pack.ratio.total} · 目标 {pack.ratio.target[st]}%
                      </p>
                    </div>
                  ))}
                </div>
                {!pack.ratio.matchesTarget && (
                  <input
                    type="text"
                    value={exceptionReason}
                    onChange={(e) => setExceptionReason(e.target.value)}
                    placeholder={isZh ? '配比偏差原因（写入 diagramme-usage.json）' : 'Exception reason'}
                    className="input h-8 text-xs"
                  />
                )}
              </div>

              {/* Card 01 Linked Map Screenshot Control */}
              <div className="rounded-lg border border-[var(--border)] p-3 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{isZh ? '图 01 · 首页联动地图' : 'Card 01 · Linked Map'}</span>
                  {coverMapSnapshotDataUrl && (
                    <button
                      type="button"
                      className="text-red-600 hover:underline"
                      onClick={() => {
                        setCoverMapSnapshotDataUrl(null);
                        setManualCoverMap(false);
                        setCapturedMapKey('');
                      }}
                    >
                      {isZh ? '重新自动同步 2D 地图' : 'Resync 2D map'}
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-muted">
                  {isZh
                    ? '默认自动根据所选活动坐标实时联动生成新加坡矢量地图；也可一键截取当前所选活动的真实 2D 网站地图。'
                    : 'Auto-linked to selected events via live GPS SVG map, or capture the real 2D MapLibre site map.'}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={capturingTarget !== null}
                    onClick={() => handleCaptureSite('map')}
                    className="btn btn-sm !h-7 !px-2.5 !text-xs"
                  >
                    {capturingTarget === 'map' ? (isZh ? '正在截取 2D 地图…' : 'Capturing…') : isZh ? '📷 一键截取当前活动 2D 网站地图' : '📷 Capture 2D Site Map'}
                  </button>
                  <label className="link cursor-pointer text-xs">
                    {isZh ? '或上传地图截图' : 'Upload image'}
                    <input type="file" accept="image/*" onChange={(e) => handleUploadImageToSlot(e, 'map')} className="hidden" />
                  </label>
                </div>
              </div>

              {/* Card 03 Optional Real Stat Highlight */}
              <label className="block space-y-1 text-xs">
                <span className="font-semibold">{isZh ? '图 03 · 自定义热度统计条（可选，如真实报名人数）' : 'Card 03 · Custom Stat Line (optional)'}</span>
                <input
                  type="text"
                  value={card3StatHighlight}
                  onChange={(e) => setCard3StatHighlight(e.target.value)}
                  placeholder={isZh ? '留空自动展示已满/候补/在招统计；也可手动写「最热门：DevFest 报名人数最多」' : 'Leave blank for auto verified stats'}
                  className="input text-xs"
                />
              </label>

              {/* Card 04 Flexible Per-Post Website & GO/NOGO Content */}
              <div className="rounded-lg border border-[var(--border)] p-3 space-y-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{isZh ? '图 04 · 本期自定义网站亮点（非固定模板）' : 'Card 04 · Custom Post Spotlight'}</span>
                  {card4ScreenshotDataUrl && (
                    <button type="button" className="text-red-600 hover:underline" onClick={() => setCard4ScreenshotDataUrl(null)}>
                      {isZh ? '恢复内置示意图' : 'Reset'}
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={capturingTarget !== null}
                    onClick={() => handleCaptureSite('gonogo')}
                    className="btn btn-sm !h-7 !px-2.5 !text-xs"
                  >
                    {capturingTarget === 'gonogo' ? (isZh ? '正在截取 GO/NOGO…' : 'Capturing…') : isZh ? '📷 一键截取网站 GO/NOGO 界面' : '📷 Capture GO/NOGO Page'}
                  </button>
                  <label className="link cursor-pointer text-xs">
                    {isZh ? '或上传自定义截图' : 'Upload screenshot'}
                    <input type="file" accept="image/*" onChange={(e) => handleUploadImageToSlot(e, 'card4')} className="hidden" />
                  </label>
                </div>
                <textarea
                  rows={2}
                  value={card4Title}
                  onChange={(e) => setCard4Title(e.target.value)}
                  placeholder="图 04 标题（支持换行）"
                  className="input h-auto py-1.5 text-xs"
                />
                <textarea
                  rows={2}
                  value={card4Intro}
                  onChange={(e) => setCard4Intro(e.target.value)}
                  placeholder="图 04 说明文字"
                  className="input h-auto py-1.5 text-xs"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={card4Point1Title}
                    onChange={(e) => setCard4Point1Title(e.target.value)}
                    className="input h-8 text-xs"
                    placeholder="要点 1 标题"
                  />
                  <input
                    type="text"
                    value={card4Point2Title}
                    onChange={(e) => setCard4Point2Title(e.target.value)}
                    className="input h-8 text-xs"
                    placeholder="要点 2 标题"
                  />
                </div>
              </div>

              {/* Global Brand, QR URL & Keywords */}
              <div className="space-y-2.5 border-t border-[var(--border)] pt-3">
                <label className="block space-y-1 text-xs">
                  <span className="font-medium">{isZh ? '图 01 封面主标题（留空按日期自动生成）' : 'Card 01 Cover Title (optional)'}</span>
                  <textarea
                    rows={2}
                    value={coverTitle}
                    onChange={(e) => setCoverTitle(e.target.value)}
                    placeholder="留空自动生成：新加坡 11/27 – 12/3 AI 活动，先看这张联动地图。"
                    className="input h-auto py-1.5 text-xs"
                  />
                </label>

                <div className="grid grid-cols-2 gap-2">
                  <label className="space-y-1 text-xs">
                    <span className="font-medium">{isZh ? '栏目小标题（.kicker）' : 'Kicker'}</span>
                    <input type="text" value={kicker} onChange={(e) => setKicker(e.target.value)} className="input text-xs" />
                  </label>
                  <label className="space-y-1 text-xs">
                    <span className="font-medium">{isZh ? '图 05 二维码网址' : 'QR Target URL'}</span>
                    <input type="text" value={siteUrl} onChange={(e) => setSiteUrl(e.target.value)} className="input text-xs" />
                  </label>
                </div>

                <label className="block space-y-1 text-xs">
                  <span className="font-medium">{isZh ? '图 05 搜索关键词（用 · 分隔）' : 'Card 05 Search Keywords'}</span>
                  <input
                    type="text"
                    value={searchKeywords}
                    onChange={(e) => setSearchKeywords(e.target.value)}
                    className="input text-xs"
                  />
                </label>

                <label className="block space-y-1 text-xs">
                  <span className="font-medium">{isZh ? '左下角页脚主题（严禁写口吻或受众指令）' : 'Footer Topic (topic only)'}</span>
                  <input
                    type="text"
                    value={footerTopic}
                    onChange={(e) => setFooterTopic(e.target.value)}
                    className={`input text-xs ${footerViolations.length ? 'border-red-500' : ''}`}
                  />
                  {footerViolations.map((v) => (
                    <span key={v} className="block text-[11px] text-red-600">
                      ⚠ {v}
                    </span>
                  ))}
                </label>

                <label className="flex items-start gap-2 rounded-md border border-[var(--border)] p-2.5 text-xs">
                  <input
                    type="checkbox"
                    checked={includeOverflowChecklist}
                    onChange={(e) => setIncludeOverflowChecklist(e.target.checked)}
                    className="mt-0.5 accent-[#1257fd]"
                  />
                  <span>
                    <strong className="font-medium">{isZh ? '超过 8 场活动时自动追加完整目录补录页' : 'Append directory pages when > 8 events'}</strong>
                    <span className="block text-[11px] text-muted">
                      {isZh ? '关闭时固定 5 页精准保持 40/20/40 配比。' : 'Keeps 5-page 40/20/40 deck when off.'}
                    </span>
                  </span>
                </label>
              </div>
            </section>
          )}
        </div>

        {/* ════════════ RIGHT COLUMN: Live 1080×1440 Preview & Export ════════════ */}
        <div className="space-y-4">
          {/* Export Action Toolbar */}
          <section className="card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={rendering || footerViolations.length > 0}
                  onClick={() => handleRenderPngPack(true)}
                  className="btn btn-primary btn-sm"
                >
                  {rendering
                    ? renderProgress || (isZh ? '正在生成 1080×1440 PNG…' : 'Rendering 1080×1440 PNGs…')
                    : envStatus.rendererAvailable
                      ? isZh ? `一键渲染 ${pack.cards.length} 张 PNG 并保存导出包` : `Render ${pack.cards.length} PNGs & Save`
                      : isZh ? `一键生成 ${pack.cards.length} 张 1080×1440 PNG` : `Generate ${pack.cards.length} PNGs`}
                </button>
                {renderedPages.length > 0 && (
                  <button type="button" className="btn btn-sm" onClick={handleDownloadAllPngs}>
                    {isZh ? `下载全部 PNG (${renderedPages.length})` : `Download PNGs (${renderedPages.length})`}
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <button type="button" className="btn btn-sm !text-xs" onClick={handleDownloadAllHtml}>
                  {isZh ? '下载全部可编辑 HTML + 配文 + JSON' : 'Download HTML + Caption + JSON'}
                </button>
                <button
                  type="button"
                  className="btn btn-sm !text-xs"
                  onClick={() => downloadTextFile('diagramme-usage.json', pack.usageJson, 'application/json;charset=utf-8')}
                >
                  usage.json
                </button>
              </div>
            </div>

            {renderError && (
              <div className="mt-3 whitespace-pre-wrap rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                {renderError}
              </div>
            )}

            {savedDiskDir && (
              <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
                ✓ {isZh ? '整套产物（PNG + src/HTML + caption.md + diagramme-usage.json）已保存到：' : 'Saved full pack to: '}
                <code className="rounded bg-white px-1.5 py-0.5 font-mono text-[11px]">{savedDiskDir}</code>
              </div>
            )}

            {renderedPages.length > 0 && (
              <div className="mt-3 space-y-3">
                <div className="overflow-x-auto rounded-md border border-[var(--border)]">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[var(--muted)] text-[11px] text-muted">
                      <tr>
                        <th className="px-3 py-2">页面</th>
                        <th className="px-3 py-2">高度校验 (≤1440)</th>
                        <th className="px-3 py-2">人在坡岛</th>
                        <th className="px-3 py-2">Stay SG</th>
                        <th className="px-3 py-2">图片</th>
                        <th className="px-3 py-2 text-right">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)]">
                      {renderedPages.map((p) => (
                        <tr key={p.pageNumber}>
                          <td className="px-3 py-1.5 font-mono font-medium">{p.pngFilename}</td>
                          <td className={`px-3 py-1.5 tabular-nums ${p.overflow ? 'font-semibold text-red-600' : 'text-emerald-700'}`}>
                            {p.scrollHeight}px {p.overflow ? '⚠ 溢出' : '✓'}
                          </td>
                          <td className="px-3 py-1.5">{p.hasBrandPill ? '✓' : '✗'}</td>
                          <td className="px-3 py-1.5">{p.hasStaySgLogo ? '✓' : '✗'}</td>
                          <td className="px-3 py-1.5">{p.imagesOk ? '✓' : '✗'}</td>
                          <td className="px-3 py-1.5 text-right">
                            <button type="button" className="link text-xs" onClick={() => downloadDataUrl(p.pngFilename, p.pngDataUrl)}>
                              {isZh ? '下载 PNG' : 'PNG'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile-friendly PNG Gallery (iPhone/Android users can long-press any image to save directly to Photos!) */}
                <div className="rounded-lg border border-[var(--border)] bg-[var(--muted)]/40 p-3 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold">
                      {isZh ? `已生成 ${renderedPages.length} 张 1080×1440 成品 PNG（手机端长按图片可直接存相册）` : `${renderedPages.length} PNGs Ready (long-press on mobile to save)`}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
                    {renderedPages.map((p) => (
                      <div key={p.pageNumber} className="space-y-1">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={p.pngDataUrl}
                          alt={p.pngFilename}
                          className="w-full rounded-md border border-[var(--border)] bg-white shadow-sm"
                        />
                        <div className="flex items-center justify-between text-[11px] text-muted">
                          <span className="font-mono">{p.pngFilename}</span>
                          <button type="button" className="link" onClick={() => downloadDataUrl(p.pngFilename, p.pngDataUrl)}>
                            {isZh ? '保存' : 'Save'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* Page Selector & Live Scaled 1080×1440 Preview */}
          {currentCard && (
            <section className="card p-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap gap-1.5">
                  {pack.cards.map((c, idx) => (
                    <button
                      key={c.pageNumber}
                      type="button"
                      onClick={() => setActivePageIdx(idx)}
                      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                        idx === safePageIdx
                          ? 'border-[var(--foreground)] bg-[var(--foreground)] text-white'
                          : 'border-[var(--border)] bg-white text-[var(--foreground)] hover:bg-[var(--muted)]'
                      }`}
                    >
                      <span className="tabular-nums">{c.pageNumber}</span>
                      <span className="hidden sm:inline opacity-80">{STYLE_LABELS[c.primaryStyle]}</span>
                    </button>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {safePageIdx === 0 && (
                    <button
                      type="button"
                      disabled={capturingTarget !== null}
                      onClick={() => handleCaptureSite('map')}
                      className="btn btn-sm !h-7 !px-2.5 !text-xs"
                    >
                      {capturingTarget === 'map' ? '同步 2D 地图中…' : '↻ 刷新 2D 实景地图'}
                    </button>
                  )}
                  {safePageIdx === pack.cards.length - 2 && envStatus.rendererAvailable && (
                    <button
                      type="button"
                      disabled={capturingTarget !== null}
                      onClick={() => handleCaptureSite('gonogo')}
                      className="btn btn-sm !h-7 !px-2.5 !text-xs"
                    >
                      {capturingTarget === 'gonogo' ? '截取中…' : '📷 截取 GO/NOGO'}
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-sm !h-7 !px-2.5 !text-xs"
                    onClick={() => setShowHtmlEditor((v) => !v)}
                  >
                    {showHtmlEditor ? (isZh ? '返回预览' : 'Preview') : (isZh ? '编辑 HTML' : 'Edit HTML')}
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm !h-7 !px-2.5 !text-xs"
                    onClick={() => downloadTextFile(currentCard.filename, currentCard.html, 'text/html;charset=utf-8')}
                  >
                    {currentCard.filename}
                  </button>
                  {currentRendered && (
                    <button
                      type="button"
                      className="btn btn-sm !h-7 !px-2.5 !text-xs"
                      onClick={() => downloadDataUrl(currentRendered.pngFilename, currentRendered.pngDataUrl)}
                    >
                      {currentRendered.pngFilename}
                    </button>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 border-y border-[var(--border)] py-2 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{currentCard.role}</span>
                  <span className="badge !h-5 !text-[11px]">1080 × 1440</span>
                  <span className="badge !h-5 !text-[11px]">
                    {currentCard.pageNumber} / {currentCard.pageTotal}
                  </span>
                </div>
                {cardHtmlOverrides[currentCard.pageNumber] && (
                  <button
                    type="button"
                    className="text-xs text-red-600 hover:underline"
                    onClick={() =>
                      setCardHtmlOverrides((prev) => {
                        const next = { ...prev };
                        delete next[currentCard.pageNumber];
                        return next;
                      })
                    }
                  >
                    {isZh ? '重置本页为自动模板' : 'Reset to template'}
                  </button>
                )}
              </div>

              {currentCard.warnings.length > 0 && (
                <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  {currentCard.warnings.map((w) => (
                    <p key={w}>⚠ {w}</p>
                  ))}
                </div>
              )}

              <div ref={previewWrapRef} className="w-full">
                {showHtmlEditor ? (
                  <textarea
                    rows={24}
                    value={currentCard.html}
                    onChange={(e) =>
                      setCardHtmlOverrides((prev) => ({
                        ...prev,
                        [currentCard.pageNumber]: e.target.value,
                      }))
                    }
                    className="input h-[560px] w-full font-mono text-xs leading-relaxed"
                  />
                ) : (
                  <div className="flex justify-center rounded-xl border border-[var(--border)] bg-[#f4f4f5] p-4 sm:p-6">
                    <div
                      className="relative overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-black/10"
                      style={{ width: previewWidth, height: scaledHeight }}
                    >
                      <iframe
                        title={currentCard.filename}
                        srcDoc={currentCard.html}
                        sandbox="allow-same-origin"
                        className="pointer-events-none origin-top-left border-0 bg-white"
                        style={{
                          width: 1080,
                          height: 1440,
                          transform: `scale(${scale})`,
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Editable Caption.md */}
          <section className="card p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold">{isZh ? '小红书配文（caption.md）' : 'Xiaohongshu Caption (caption.md)'}</h2>
                <p className="text-xs text-muted">
                  {isZh
                    ? '按 tone-and-caption.md 自动生成：真实痛点 → 逐页短句 → 边界提醒 → 轻互动提问。'
                    : 'Auto-generated per tone-and-caption.md.'}
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {captionOverride !== null && (
                  <button type="button" className="btn btn-sm !h-7 !px-2.5 !text-xs" onClick={() => setCaptionOverride(null)}>
                    {isZh ? '重新生成' : 'Regenerate'}
                  </button>
                )}
                <button type="button" className="btn btn-sm !h-7 !px-2.5 !text-xs" onClick={handleCopyCaption}>
                  {copiedCaption ? (isZh ? '✓ 已复制' : '✓ Copied') : (isZh ? '复制配文' : 'Copy')}
                </button>
                <button
                  type="button"
                  className="btn btn-sm !h-7 !px-2.5 !text-xs"
                  onClick={() => downloadTextFile('caption.md', captionValue, 'text/markdown;charset=utf-8')}
                >
                  caption.md
                </button>
              </div>
            </div>
            <textarea
              rows={9}
              value={captionValue}
              onChange={(e) => setCaptionOverride(e.target.value)}
              className="input h-auto w-full py-2.5 text-[13px] leading-relaxed"
            />
          </section>
        </div>
      </div>
    </div>
  );
}
