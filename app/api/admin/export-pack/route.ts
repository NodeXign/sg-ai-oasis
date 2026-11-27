import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { isReadOnlyFsError } from '@/lib/friend-events';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ExportCardPayload {
  pageNumber: string;
  filename: string;
  pngFilename: string;
  html: string;
}

interface ExportPackPayload {
  packSlug: string;
  cards: ExportCardPayload[];
  captionMd: string;
  usageJson: string;
  saveToDisk?: boolean;
}

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

function loadPlaywright(): { mod: any; resolvedFrom: string } | null {
  // Use runtime Node require so webpack never tries to statically bundle optional playwright-core.
  const runtimeRequire: NodeRequire = eval('require');
  for (const candidate of getPlaywrightCandidates()) {
    try {
      const mod = runtimeRequire(candidate);
      if (mod?.chromium) {
        return { mod, resolvedFrom: candidate };
      }
    } catch {
      // try next candidate
    }
  }
  return null;
}

function checkAdminAuth(req: Request): NextResponse | null {
  const required = process.env.ADMIN_PASSWORD?.trim();
  if (!required) return null;
  const provided = req.headers.get('x-admin-token')?.trim() ?? '';
  if (provided !== required) {
    return NextResponse.json({ ok: false, error: 'Unauthorized: invalid admin passcode.' }, { status: 401 });
  }
  return null;
}

export async function GET() {
  const pw = loadPlaywright();
  const browserPath = findBrowserExecutable();
  const rendererAvailable = Boolean(pw && browserPath);
  return NextResponse.json({
    ok: true,
    rendererAvailable,
    playwrightFound: Boolean(pw),
    browserFound: Boolean(browserPath),
    authRequired: Boolean(process.env.ADMIN_PASSWORD?.trim()),
    renderCommand: 'node ~/AI-Harness/templates/diagramme-xhs/render.mjs --dir <folder>',
  });
}

export async function POST(req: Request) {
  const denied = checkAdminAuth(req);
  if (denied) return denied;

  let body: ExportPackPayload;
  try {
    body = (await req.json()) as ExportPackPayload;
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON payload.' }, { status: 400 });
  }

  if (!Array.isArray(body.cards) || body.cards.length === 0) {
    return NextResponse.json({ ok: false, error: 'No cards provided.' }, { status: 400 });
  }

  const safeSlug =
    (body.packSlug || `xhs-life-${Date.now()}`)
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 64) || 'xhs-life-pack';

  const pw = loadPlaywright();
  const executablePath = findBrowserExecutable();

  if (!pw || !executablePath) {
    return NextResponse.json({
      ok: false,
      rendererAvailable: false,
      playwrightFound: Boolean(pw),
      browserFound: Boolean(executablePath),
      reason: !pw
        ? '当前运行环境未找到 playwright-core（通常为线上无服务器环境或新设备尚未安装依赖）。'
        : '当前运行环境未找到本机 Chrome / Edge 可执行文件。',
      hint: '可先下载可编辑 HTML + caption.md + diagramme-usage.json，再在已装依赖的设备上运行 node ~/AI-Harness/templates/diagramme-xhs/render.mjs --dir <导出目录>。',
    });
  }

  const outRoot = path.join(process.cwd(), 'exports', safeSlug);
  const srcDir = path.join(outRoot, 'src');
  let diskWritable = Boolean(body.saveToDisk);
  let savedDir: string | null = null;

  if (diskWritable) {
    try {
      await fsp.mkdir(srcDir, { recursive: true });
      await fsp.writeFile(path.join(outRoot, 'caption.md'), body.captionMd ?? '', 'utf8');
      await fsp.writeFile(path.join(outRoot, 'diagramme-usage.json'), body.usageJson ?? '{}', 'utf8');
      savedDir = outRoot;
    } catch (err) {
      if (isReadOnlyFsError(err)) {
        diskWritable = false;
        savedDir = null;
      } else {
        throw err;
      }
    }
  }

  const browser = await pw.mod.chromium.launch({
    executablePath,
    headless: true,
  });

  try {
    const page = await browser.newPage({
      viewport: { width: 1080, height: 1440 },
      deviceScaleFactor: 1,
    });

    const pages: {
      pageNumber: string;
      filename: string;
      pngFilename: string;
      pngDataUrl: string;
      scrollHeight: number;
      overflow: boolean;
      imagesOk: boolean;
      hasBrandPill: boolean;
      hasStaySgLogo: boolean;
    }[] = [];

    for (const card of body.cards) {
      const safeHtmlName = path.basename(card.filename || `${card.pageNumber}.html`);
      const safePngName = path.basename(card.pngFilename || `${card.pageNumber}.png`);

      if (diskWritable) {
        await fsp.writeFile(path.join(srcDir, safeHtmlName), card.html, 'utf8');
      }

      await page.setContent(card.html, { waitUntil: 'networkidle', timeout: 15000 }).catch(async () => {
        await page.setContent(card.html, { waitUntil: 'load' });
      });
      await page.evaluate(() => document.fonts.ready);

      const stats = await page.evaluate(() => {
        const pillText = document.querySelector('.brand-pill')?.textContent?.trim() ?? '';
        const logoLabel = document.querySelector('.brand-logo')?.getAttribute('aria-label') ?? '';
        const logoText = document.querySelector('.brand-logo svg text')?.textContent?.trim() ?? '';
        return {
          scrollHeight: document.body.scrollHeight,
          imagesOk: Array.from(document.images).every((img) => img.complete && img.naturalWidth > 0),
          hasBrandPill: pillText === '人在坡岛',
          hasStaySgLogo: logoLabel.includes('Stay SG') && logoText === 'Stay SG',
        };
      });

      const buffer: Buffer = await page.screenshot({
        type: 'png',
        clip: { x: 0, y: 0, width: 1080, height: 1440 },
      });

      if (diskWritable) {
        await fsp.writeFile(path.join(outRoot, safePngName), buffer);
      }

      pages.push({
        pageNumber: card.pageNumber,
        filename: safeHtmlName,
        pngFilename: safePngName,
        pngDataUrl: `data:image/png;base64,${buffer.toString('base64')}`,
        scrollHeight: stats.scrollHeight,
        overflow: stats.scrollHeight > 1440,
        imagesOk: stats.imagesOk,
        hasBrandPill: stats.hasBrandPill,
        hasStaySgLogo: stats.hasStaySgLogo,
      });
    }

    return NextResponse.json({
      ok: true,
      rendererAvailable: true,
      packSlug: safeSlug,
      savedDir,
      pages,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Playwright render failed.';
    return NextResponse.json({ ok: false, rendererAvailable: true, error: message }, { status: 500 });
  } finally {
    await browser.close();
  }
}
