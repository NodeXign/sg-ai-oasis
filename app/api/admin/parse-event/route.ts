import { execFile } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { NextResponse } from 'next/server';
import {
  enrichDraftWithGeo,
  extractFirstUrl,
  parseEventText,
  parseHtmlEventPage,
  parseLumaApiPayload,
  type ParsedEventDraft,
} from '@/lib/event-parser';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const execFileAsync = promisify(execFile);
const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB

function getMacOcrScriptPath(): string {
  return path.join(process.cwd(), 'scripts', 'macos_ocr.jxa');
}

function detectOcrEngine(): { available: boolean; engine: 'macos-vision' | 'none' } {
  if (
    process.platform === 'darwin' &&
    fs.existsSync('/usr/bin/osascript') &&
    fs.existsSync(getMacOcrScriptPath())
  ) {
    return { available: true, engine: 'macos-vision' };
  }
  return { available: false, engine: 'none' };
}

function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!h || h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal')) return true;
  if (h === '::1' || h.startsWith('fe80:') || h.startsWith('fc') || h.startsWith('fd')) return true;
  if (/^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h) || /^0\./.test(h)) {
    return true;
  }
  const m172 = h.match(/^172\.(\d+)\./);
  if (m172 && Number(m172[1]) >= 16 && Number(m172[1]) <= 31) return true;
  return false;
}

function validatePublicUrl(rawUrl: string): URL {
  const u = new URL(rawUrl);
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error('仅支持 http / https 公开链接。');
  }
  if (isBlockedHost(u.hostname)) {
    throw new Error('不支持解析本地或内网地址。');
  }
  return u;
}

async function fetchAndParseUrl(
  rawUrl: string,
  fallbackDate?: string,
): Promise<{ draft: ParsedEventDraft; sourceLabel: string; warning?: string }> {
  const parsedUrl = validatePublicUrl(rawUrl);
  const host = parsedUrl.hostname.toLowerCase();

  // 1. Direct Luma public API (fastest + richest structured data)
  if (host === 'lu.ma' || host === 'luma.com' || host === 'www.luma.com' || host === 'www.lu.ma') {
    const slug = parsedUrl.pathname.replace(/^\/+|\/+$/g, '').split('/')[0];
    if (slug && !['discover', 'calendar', 'home', 'signin'].includes(slug.toLowerCase())) {
      try {
        const apiRes = await fetch(`https://api.lu.ma/url?url=${encodeURIComponent(slug)}`, {
          headers: { 'User-Agent': BROWSER_UA, Accept: 'application/json' },
          signal: AbortSignal.timeout(10000),
        });
        if (apiRes.ok) {
          const json = await apiRes.json();
          const lumaDraft = parseLumaApiPayload(json, rawUrl);
          if (lumaDraft) {
            return { draft: lumaDraft, sourceLabel: 'Luma 活动页 API' };
          }
        }
      } catch {
        // Fall through to generic HTML fetch
      }
    }
  }

  // 2. Generic public HTML fetch (JSON-LD Event + OpenGraph + text fallback)
  const res = await fetch(parsedUrl.toString(), {
    headers: {
      'User-Agent': BROWSER_UA,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    return {
      draft: { url: rawUrl },
      sourceLabel: '链接抓取失败',
      warning: `网页返回 HTTP ${res.status}（部分平台如受限页面可能拦截抓取，可直接粘贴活动文案或截图导入）。`,
    };
  }

  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('text/') && !contentType.includes('html') && !contentType.includes('json')) {
    return {
      draft: { url: rawUrl },
      sourceLabel: '非网页链接',
      warning: '该链接不是 HTML 网页，已保留为报名链接。',
    };
  }

  const html = (await res.text()).slice(0, 1_500_000);
  const { draft, sourceLabel } = parseHtmlEventPage(html, res.url || rawUrl, fallbackDate);
  return { draft, sourceLabel };
}

async function runImageOcr(imageBuffer: Buffer, ext: string): Promise<{ text: string; engine: string }> {
  const ocr = detectOcrEngine();
  if (!ocr.available) {
    throw new Error('当前运行环境未配置本机图片 OCR（Mac 本地运行自动启用 Apple Vision OCR；线上环境请先复制海报文字或粘贴活动链接）。');
  }

  const safeExt = /^[a-z0-9]{2,5}$/i.test(ext) ? ext.toLowerCase() : 'png';
  const tmpPath = path.join(os.tmpdir(), `sg_oasis_ocr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${safeExt}`);

  await fsp.writeFile(tmpPath, imageBuffer);
  try {
    const { stdout } = await execFileAsync(
      '/usr/bin/osascript',
      ['-l', 'JavaScript', getMacOcrScriptPath(), tmpPath],
      { timeout: 20000, maxBuffer: 2 * 1024 * 1024 },
    );
    return { text: stdout.trim(), engine: 'macOS Vision OCR' };
  } finally {
    await fsp.unlink(tmpPath).catch(() => {});
  }
}

function mergeDrafts(...drafts: (ParsedEventDraft | null | undefined)[]): ParsedEventDraft {
  const merged: ParsedEventDraft = {};
  for (const d of drafts) {
    if (!d) continue;
    if (!merged.title && d.title) merged.title = d.title;
    if (!merged.date && d.date) merged.date = d.date;
    if (!merged.startTime && d.startTime) merged.startTime = d.startTime;
    if (!merged.endTime && d.endTime) merged.endTime = d.endTime;
    if (!merged.organiser && d.organiser) merged.organiser = d.organiser;
    if (merged.isOnline === undefined && d.isOnline !== undefined) merged.isOnline = d.isOnline;
    if (!merged.venue && d.venue) merged.venue = d.venue;
    if (!merged.address && d.address) merged.address = d.address;
    if (merged.lat == null && d.lat != null) merged.lat = d.lat;
    if (merged.lng == null && d.lng != null) merged.lng = d.lng;
    if (!merged.url && d.url) merged.url = d.url;
    if (!merged.coverImageUrl && d.coverImageUrl) merged.coverImageUrl = d.coverImageUrl;
    if (merged.isFree === undefined && d.isFree !== undefined) merged.isFree = d.isFree;
    if (!merged.price && d.price) merged.price = d.price;
    if (!merged.status && d.status) merged.status = d.status;
    if (!merged.friendNote && d.friendNote) merged.friendNote = d.friendNote;
  }
  return merged;
}

export async function GET() {
  const ocr = detectOcrEngine();
  return NextResponse.json({
    ok: true,
    urlParseAvailable: true,
    textParseAvailable: true,
    ocrAvailable: ocr.available,
    ocrEngine: ocr.engine,
  });
}

export async function POST(req: Request) {
  try {
    let rawText = '';
    let rawUrl = '';
    let fallbackDate: string | undefined;
    let imageBuffer: Buffer | null = null;
    let imageExt = 'png';

    const contentType = req.headers.get('content-type') || '';
    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData();
      rawText = String(form.get('text') || '').trim();
      rawUrl = String(form.get('url') || '').trim();
      fallbackDate = String(form.get('fallbackDate') || '').trim() || undefined;
      const file = form.get('image');
      if (file && file instanceof File && file.size > 0) {
        if (file.size > MAX_IMAGE_BYTES) {
          return NextResponse.json({ ok: false, error: '图片过大，请上传 10MB 以内的海报或截图。' }, { status: 400 });
        }
        imageBuffer = Buffer.from(await file.arrayBuffer());
        const nameExt = path.extname(file.name).replace(/^\./, '');
        const mimeExt = file.type.split('/')[1] || 'png';
        imageExt = nameExt || mimeExt;
      }
    } else {
      const body = await req.json();
      rawText = String(body?.text || '').trim();
      rawUrl = String(body?.url || '').trim();
      fallbackDate = String(body?.fallbackDate || '').trim() || undefined;
      if (typeof body?.imageDataUrl === 'string' && body.imageDataUrl.startsWith('data:image/')) {
        const m = body.imageDataUrl.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,(.+)$/);
        if (m) {
          const buf = Buffer.from(m[2], 'base64');
          if (buf.length > MAX_IMAGE_BYTES) {
            return NextResponse.json({ ok: false, error: '图片过大，请上传 10MB 以内的海报或截图。' }, { status: 400 });
          }
          imageBuffer = buf;
          imageExt = m[1] === 'jpeg' ? 'jpg' : m[1];
        }
      }
    }

    if (!rawText && !rawUrl && !imageBuffer) {
      return NextResponse.json({ ok: false, error: '请至少提供活动链接、文字文案或海报图片中的一项。' }, { status: 400 });
    }

    const sourcesUsed: string[] = [];
    const warnings: string[] = [];
    let ocrText = '';
    let ocrDraft: ParsedEventDraft | null = null;
    let textDraft: ParsedEventDraft | null = null;
    let urlDraft: ParsedEventDraft | null = null;

    // Step 1: Image OCR if image was attached
    if (imageBuffer) {
      try {
        const res = await runImageOcr(imageBuffer, imageExt);
        ocrText = res.text;
        if (ocrText) {
          ocrDraft = parseEventText(ocrText, fallbackDate);
          sourcesUsed.push(res.engine);
        } else {
          warnings.push('图片中未识别到清晰文字，建议换清晰海报或补充文字。');
        }
      } catch (err) {
        warnings.push(err instanceof Error ? err.message : '图片 OCR 解析失败');
      }
    }

    // Step 2: Text extraction
    if (rawText) {
      textDraft = parseEventText(rawText, fallbackDate);
      sourcesUsed.push('文案规则提取');
    }

    // Step 3: URL fetch (explicit URL, or URL found inside pasted text / OCR text)
    const targetUrl = rawUrl || extractFirstUrl(rawText) || extractFirstUrl(ocrText) || '';
    if (targetUrl) {
      try {
        const urlRes = await fetchAndParseUrl(targetUrl, fallbackDate);
        urlDraft = urlRes.draft;
        sourcesUsed.push(urlRes.sourceLabel);
        if (urlRes.warning) warnings.push(urlRes.warning);
      } catch (err) {
        warnings.push(err instanceof Error ? err.message : '链接解析失败');
      }
    }

    // Merge with priority: URL structured metadata > Explicit text > OCR image text
    const merged = enrichDraftWithGeo(mergeDrafts(urlDraft, textDraft, ocrDraft));

    const missingFields: string[] = [];
    if (!merged.title) missingFields.push('活动名称');
    if (!merged.date) missingFields.push('日期');

    return NextResponse.json({
      ok: true,
      draft: merged,
      sourcesUsed,
      rawOcrText: ocrText || undefined,
      missingFields,
      readyForOneClick: missingFields.length === 0,
      warnings,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '解析失败';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
