'use client';

import { toPng } from 'html-to-image';

export interface ClientRenderedPage {
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

/**
 * Renders an exact 1080x1440 HTML card string directly into a PNG data URL in the browser
 * (works on iPhone Safari, Android Chrome, Desktop, and Vercel without needing Playwright).
 */
export async function renderCardHtmlToPngClient(card: {
  pageNumber: string;
  filename: string;
  pngFilename: string;
  html: string;
}): Promise<ClientRenderedPage> {
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.left = '-10000px';
  iframe.style.top = '0';
  iframe.style.width = '1080px';
  iframe.style.height = '1440px';
  iframe.style.border = '0';
  iframe.style.pointerEvents = 'none';
  iframe.setAttribute('aria-hidden', 'true');
  document.body.appendChild(iframe);

  try {
    await new Promise<void>((resolve) => {
      const done = () => resolve();
      const timeout = setTimeout(done, 8000);
      iframe.onload = () => {
        clearTimeout(timeout);
        resolve();
      };
      iframe.srcdoc = card.html;
    });

    const doc = iframe.contentDocument;
    if (!doc?.body) {
      throw new Error('Browser iframe document unavailable.');
    }

    if (doc.fonts?.ready) {
      await doc.fonts.ready.catch(() => {});
    }

    // Wait for all <img> tags inside the card (base64 map PNGs, proxied Luma posters) to finish decoding
    const imgs = Array.from(doc.images);
    await Promise.all(
      imgs.map(
        (img) =>
          new Promise<void>((resolve) => {
            if (img.complete) return resolve();
            const t = setTimeout(resolve, 6000);
            img.onload = () => {
              clearTimeout(t);
              resolve();
            };
            img.onerror = () => {
              clearTimeout(t);
              resolve();
            };
          }),
      ),
    );
    await new Promise((r) => setTimeout(r, 120));

    const pillText = doc.querySelector('.brand-pill')?.textContent?.trim() ?? '';
    const logoLabel = doc.querySelector('.brand-logo')?.getAttribute('aria-label') ?? '';
    const logoText = doc.querySelector('.brand-logo svg text')?.textContent?.trim() ?? '';
    const scrollHeight = doc.body.scrollHeight;
    const imagesOk = imgs.every((img) => img.complete && img.naturalWidth > 0);

    const pngDataUrl = await toPng(doc.body, {
      width: 1080,
      height: 1440,
      canvasWidth: 1080,
      canvasHeight: 1440,
      pixelRatio: 1,
      backgroundColor: '#FFFFFF',
      cacheBust: true,
    });

    return {
      pageNumber: card.pageNumber,
      filename: card.filename,
      pngFilename: card.pngFilename,
      pngDataUrl,
      scrollHeight,
      overflow: scrollHeight > 1440,
      imagesOk,
      hasBrandPill: pillText === '人在坡岛',
      hasStaySgLogo: logoLabel.includes('Stay SG') && logoText === 'Stay SG',
    };
  } finally {
    iframe.remove();
  }
}
