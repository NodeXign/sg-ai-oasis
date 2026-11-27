import type { Metadata } from 'next';
import { Inter, Noto_Sans_SC } from 'next/font/google';
import { notFound } from 'next/navigation';
import '../globals.css';
import { LANGS, getDict, isLang } from '@/lib/i18n';
import SiteFooter from '@/components/SiteFooter';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const notoSansSC = Noto_Sans_SC({ subsets: ['latin'], weight: ['400', '500', '700'], variable: '--font-noto-sc', display: 'swap' });

export function generateStaticParams() {
  return LANGS.map((lang) => ({ lang }));
}

export function generateMetadata({ params }: { params: { lang: string } }): Metadata {
  const lang = isLang(params.lang) ? params.lang : 'zh';
  const t = getDict(lang);
  return {
    metadataBase: new URL('https://sgaioasis.vercel.app'),
    title: t.siteTitle,
    description: t.siteDescription,
    keywords: [
      'SG AI Oasis',
      'Singapore AI events',
      'Singapore AI jobs',
      '新加坡 AI 活动',
      '新加坡 AI 岗位',
      '人在坡岛',
      'Stay SG',
    ],
    openGraph: {
      title: t.siteTitle,
      description: t.siteDescription,
      siteName: 'SG AI Oasis',
      url: `/${lang}`,
    },
    alternates: {
      canonical: `/${lang}`,
      languages: { 'zh-Hans': '/zh', en: '/en' },
    },
  };
}

export default function RootLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { lang: string };
}) {
  if (!isLang(params.lang)) notFound();
  const t = getDict(params.lang);
  return (
    <html lang={t.htmlLang} className={`${inter.variable} ${notoSansSC.variable}`}>
      <body className="flex min-h-dvh flex-col">
        {children}
        <SiteFooter lang={params.lang} />
      </body>
    </html>
  );
}
