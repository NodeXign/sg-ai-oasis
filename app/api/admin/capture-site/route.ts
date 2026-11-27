import fs from 'node:fs';
import path from 'node:path';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getPlaywrightCandidates(): string[] {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const localAppData = process.env.LOCALAPPDATA || '';
  return [
    process.env.PLAYWRIGHT_CORE_PATH || '',
    'playwright-core',
    home ? path.join(home, 'Library', 'Caches', 'hairline-look', 'node_modules', 'playwright-core') : '',
    localAppData ? path.join(localAppData, 'hairline-look', 'node_modules', 'playwright-core') : '',
    '/tmp/node_modules/playwright-core',
  ].filter(Boolean);
}

function findBrowserExecutable(): string | undefined {
  const candidates = [
    process.env.CHROME_PATH || '',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
  ].filter(Boolean);
  return candidates.find((p) => fs.existsSync(p));
}

function loadPlaywright(): any | null {
  const runtimeRequire: NodeRequire = eval('require');
  for (const candidate of getPlaywrightCandidates()) {
    try {
      const mod = runtimeRequire(candidate);
      if (mod?.chromium) return mod;
    } catch {
      // try next
    }
  }
  return null;
}

export async function POST(req: Request) {
  let body: {
    target?: 'map' | 'gonogo';
    lang?: 'zh' | 'en';
    startDate?: string;
    endDate?: string;
    selectedIds?: string[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body.' }, { status: 400 });
  }

  const target = body.target === 'gonogo' ? 'gonogo' : 'map';
  const lang = body.lang === 'en' ? 'en' : 'zh';

  const pw = loadPlaywright();
  const executablePath = findBrowserExecutable();
  if (!pw || !executablePath) {
    return NextResponse.json({
      ok: false,
      rendererAvailable: false,
      error: '当前运行环境未找到本机 Playwright / Chrome，无法自动截取网页图（你可以手动上传截图，或使用内置实时联动地图）。',
    });
  }

  // Always capture from the current server's own origin (never arbitrary external URLs)
  const reqUrl = new URL(req.url);
  const origin = `${reqUrl.protocol}//${reqUrl.host}`;

  let pageUrl = `${origin}/${lang}/gonogo`;
  if (target === 'map') {
    const qs = new URLSearchParams();
    if (Array.isArray(body.selectedIds) && body.selectedIds.length > 0) {
      qs.set('ids', body.selectedIds.slice(0, 60).join(','));
    } else {
      if (body.startDate) qs.set('start', body.startDate);
      if (body.endDate) qs.set('end', body.endDate);
    }
    pageUrl = `${origin}/${lang}/admin/map-shot?${qs.toString()}`;
  }

  const browser = await pw.chromium.launch({
    executablePath,
    headless: true,
  });

  try {
    const viewport = target === 'map' ? { width: 944, height: 650 } : { width: 1200, height: 740 };
    const page = await browser.newPage({ viewport, deviceScaleFactor: 2 });

    await page.goto(pageUrl, { waitUntil: 'networkidle', timeout: 25000 }).catch(() => {});
    await page.evaluate(() => document.fonts.ready);

    if (target === 'map') {
      // Wait for MapLibre canvas + OpenFreeMap vector tiles + callout markers to finish settling
      await page.waitForSelector('.map-stage canvas', { timeout: 12000 }).catch(() => {});
      await page.waitForTimeout(2600);
      const mapStage = page.locator('.map-stage').first();
      const hasStage = (await mapStage.count()) > 0;
      const buf: Buffer = hasStage
        ? await mapStage.screenshot({ type: 'png' })
        : await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: 944, height: 630 } });
      return NextResponse.json({
        ok: true,
        target,
        dataUrl: `data:image/png;base64,${buf.toString('base64')}`,
      });
    }

    // GO/NOGO capture: hide sticky site header & footer so the tool interface fills cleanly without left clipping
    await page.waitForTimeout(700);
    await page.addStyleTag({
      content: 'header.sticky, footer { display: none !important; } main { padding-top: 12px !important; padding-bottom: 12px !important; }',
    });
    const mainEl = page.locator('main').first();
    const buf: Buffer = (await mainEl.count()) > 0
      ? await mainEl.screenshot({ type: 'png' })
      : await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: 1200, height: 700 } });
    return NextResponse.json({
      ok: true,
      target,
      dataUrl: `data:image/png;base64,${buf.toString('base64')}`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Screenshot capture failed.';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  } finally {
    await browser.close();
  }
}
