import type { JobFunction, JobSeniority, Lang } from './types';

export const LANGS: Lang[] = ['zh', 'en'];
export const isLang = (v: string): v is Lang => v === 'zh' || v === 'en';

const zh = {
  htmlLang: 'zh-Hans',
  siteTitle: 'SG AI Oasis · 新加坡 AI 机会地图',
  siteDescription: '把新加坡的 AI 活动和在招岗位连在一起：先在活动上认识团队，再去官网投递。',
  nav: { home: '机会地图', events: '活动', jobs: '在招岗位' },
  switchTo: 'English',
  home: {
    eyebrow: '新加坡 · AI 活动 × 在招岗位',
    title: '先在活动上认识团队，再去投递。',
    lead: '这里把新加坡的 AI 活动和正在招人的公司放在同一张地图上。你可以看到这周去哪场活动，能遇到哪家在招人的公司。',
    ctaEvents: '看本周活动',
    ctaJobs: '看在招岗位',
    statEvents: '场活动 · 未来 7 天',
    statJobs: '个官网核实岗位',
    statCompanies: '家招聘公司',
    mapTitle: '本周活动地图',
    mapNote: '蓝色实心点：主办方正在新加坡招人。',
    mapCount: (n: number) => `${n} 场已标注`,
    mapReset: '重置视图',
    mapExpand: '全屏查看',
    mapCollapse: '退出全屏',
    map3D: '3D',
    map2D: '2D',
    mapClusterHint: '带 + 的编号表示该地点有多场活动；下方按时间列出全部活动。',
    legendExact: '确定具体地址',
    legendArea: '仅确定区域位置（具体地址待公布）',
    legendHiring: '主办方在招人',
    legendEvent: '社区活动',
    hiringBadge: '招人',
    mrtShort: (name: string, mins: number) => `${name} 站 · 步行 ${mins} 分`,
    mrtArea: (area: string) => `${area} 区域 · 地址待公布`,
    viewRoles: '查看在招岗位',
    close: '关闭',
    noCoords: (n: number) => `另有 ${n} 场活动的地址报名后才公开，未显示在地图上。`,
    byDay: '活动分布 · 按日期',
    byFunction: '岗位分布 · 按职能',
    allJobs: '全部岗位',
    allEvents: '全部活动',
    linkTitle: '这周能在活动上遇到的招聘公司',
    linkLead: '活动主办方或活动名称里出现了我们跟踪的公司，而且它此刻在新加坡有公开岗位。参加活动不等于内推，但你可以带着问题去。',
    linkEmpty: '这周没有同时“在招人”又“办活动”的公司。每天更新，明天再来看。',
    openRoles: (n: number) => `${n} 个在招岗位`,
    goodTitle: 'Tech for Good：这个网站对你有什么用',
    goodLead: '找工作的信息不该只属于人脉广的人。我们把分散的公开信息整理好，免费给所有人用。',
    good: [
      { title: '少走弯路', body: '活动和岗位本来在不同的网站上。这里连在一起，你能直接看到哪场活动值得为了求职去一趟。' },
      { title: '只放核实过的岗位', body: '每个岗位都来自公司自己的招聘页，每天核对，下架的会被移除。不搬运来路不明的信息。' },
      { title: '免费，不用登录', body: '不收费，不要求注册，不收集你的简历。所有链接直接跳到官方报名页和投递页。' },
      { title: '来源公开', body: '活动来自开放的社区日历，岗位来自公司公开的招聘接口。代码和数据都在 GitHub 上。' },
    ],
    stepsTitle: '怎么用',
    steps: [
      { title: '发现', body: '看这周有哪些 AI 活动，哪些公司在招人。' },
      { title: '认识', body: '去一场主办方正在招人的活动，了解团队在做什么。' },
      { title: '投递', body: '回到岗位页，从官网链接投递。' },
    ],
  },
  events: {
    title: '活动',
    lead: '新加坡近期的 AI 活动，按日期排列。名称、时间和报名链接都保持主办方的原始信息。',
    week: '本周',
    month: '未来 30 天',
    empty: '这个时间段内暂时没有活动。',
    count: (n: number) => `${n} 场`,
    register: '报名',
    free: '免费',
    paid: '收费',
    online: '线上',
    status: { open: '可报名', approval: '需审核', waitlist: '候补', sold_out: '已满' },
    hiring: (name: string, n: number) => `${name} 在招 ${n} 个岗位`,
    walk: (name: string, mins: number) => `${name} 地铁站步行约 ${mins} 分钟`,
    addressHidden: '地址报名后公开',
    by: '主办',
    sourcesTitle: '活动从哪里来',
    sourcesLead: '活动数据来自开放来源，每天同步一次。我们不改动活动名称和时间，也不收录主办人的个人信息。',
    sourceCount: (n: number) => `当前收录 ${n} 场`,
    sourceMissing: '发现有活动没被收录？把它提交到 AI @ Singapore 日历，下一次同步就会出现在这里。',
    updated: '最近同步',
  },
  jobs: {
    title: '在招岗位',
    lead: '跟踪的公司此刻在新加坡公开招聘的岗位。先从图谱里选一个职能或公司，再看下面的表格。',
    stats: { roles: '在招岗位', companies: '招聘公司', ai: 'AI 相关', fresh: '近 7 天发布' },
    byFunctionTitle: '按职能看',
    byFunctionLead: '每一行是一个职能，右边是这个职能里最常见的岗位名称。点击任意一项筛选表格。',
    byCompanyTitle: '按公司看',
    byCompanyLead: '字越大，在招岗位越多。点击公司名称筛选表格。',
    tableTitle: '全部岗位',
    root: '在招岗位',
    search: '搜索岗位或公司',
    aiOnly: '只看 AI 相关',
    clear: '清除筛选',
    results: (n: number) => `${n} 个岗位`,
    col: { role: '岗位', company: '公司', fn: '职能', level: '级别', posted: '发布', verified: '核实', apply: '投递' },
    apply: '官网投递',
    more: (n: number) => `显示更多（还有 ${n} 个）`,
    empty: '没有符合条件的岗位。清除筛选再试试。',
    verifiedNote: '岗位来自各公司官方招聘页，每天核对一次；连续两次找不到会被移除。岗位名称保持官方原文。',
    updated: '最近核对',
  },
  fn: {
    product: '产品', design: '设计', ai_ml: 'AI / 机器学习', data: '数据', software: '软件开发 / 全栈',
    infra: '基础设施与安全', solutions: '解决方案与交付', strategy: '战略与运营', gtm: '销售与市场',
    corporate: '职能支持', other: '其他',
  } as Record<JobFunction, string>,
  level: { intern: '实习', junior: '初级', mid: '中级', senior: '高级', lead: '负责人 / 专家' } as Record<JobSeniority, string>,
  footer: {
    line: 'SG AI Oasis 是「人在坡岛」的开源项目。活动与岗位每天自动更新。',
    disclaimer: '参加活动不代表能获得内推或面试。请以官方页面信息为准。',
    github: 'GitHub',
  },
};

type Dict = typeof zh;

const en: Dict = {
  htmlLang: 'en',
  siteTitle: 'SG AI Oasis · Singapore AI Opportunity Map',
  siteDescription: 'AI events and open roles in Singapore, linked: meet the team at an event, then apply on their own site.',
  nav: { home: 'Map', events: 'Events', jobs: 'Jobs' },
  switchTo: '中文',
  home: {
    eyebrow: 'Singapore · AI events × open roles',
    title: 'Meet the team at an event. Then apply.',
    lead: 'AI events in Singapore and the companies hiring here, on one map. See which event this week puts you in the same room as a team with open roles.',
    ctaEvents: "This week's events",
    ctaJobs: 'Open roles',
    statEvents: 'events in the next 7 days',
    statJobs: 'roles verified at source',
    statCompanies: 'companies hiring',
    mapTitle: "This week's event map",
    mapNote: 'Solid blue dot: the organiser is hiring in Singapore.',
    mapCount: (n: number) => `${n} mapped`,
    mapReset: 'Reset view',
    mapExpand: 'Expand map',
    mapCollapse: 'Exit full view',
    map3D: '3D',
    map2D: '2D',
    mapClusterHint: 'A + indicates multiple events at a location. All events are listed below in time order.',
    legendExact: 'Exact venue confirmed',
    legendArea: 'Area only (address TBA)',
    legendHiring: 'Organiser is hiring',
    legendEvent: 'Community event',
    hiringBadge: 'Hiring',
    mrtShort: (name: string, mins: number) => `${name} MRT · ${mins}m walk`,
    mrtArea: (area: string) => `${area} area · TBA`,
    viewRoles: 'View open roles',
    close: 'Close',
    noCoords: (n: number) => `${n} more ${n === 1 ? 'event shares its' : 'events share their'} address after registration and ${n === 1 ? 'is' : 'are'} not on the map.`,
    byDay: 'Events by day',
    byFunction: 'Roles by function',
    allJobs: 'All roles',
    allEvents: 'All events',
    linkTitle: 'Hiring companies you can meet this week',
    linkLead: 'A company we track appears as the organiser or in the event name, and it has open roles in Singapore right now. Attending is not a referral, but you can come with questions.',
    linkEmpty: 'No company is both hiring and hosting this week. The data updates daily, so check back tomorrow.',
    openRoles: (n: number) => `${n} open ${n === 1 ? 'role' : 'roles'}`,
    goodTitle: 'Tech for Good: what this site does for you',
    goodLead: 'Job information should not belong only to people with large networks. We organise scattered public information and give it to everyone for free.',
    good: [
      { title: 'Fewer detours', body: 'Events and jobs live on different sites. Here they are linked, so you can see which event is worth attending for your job search.' },
      { title: 'Verified roles only', body: 'Every role comes from the company’s own careers page and is checked daily. Closed roles are removed.' },
      { title: 'Free, no login', body: 'No fees, no sign-up, no CV collection. Every link goes straight to the official registration or application page.' },
      { title: 'Open sources', body: 'Events come from open community calendars, roles from public careers boards. Code and data are on GitHub.' },
    ],
    stepsTitle: 'How to use it',
    steps: [
      { title: 'Discover', body: 'See this week’s AI events and which companies are hiring.' },
      { title: 'Meet', body: 'Go to an event whose organiser is hiring and learn what the team builds.' },
      { title: 'Apply', body: 'Return to the jobs page and apply through the official link.' },
    ],
  },
  events: {
    title: 'Events',
    lead: 'Upcoming AI events in Singapore, by date. Names, times and registration links are kept exactly as the organisers published them.',
    week: 'This week',
    month: 'Next 30 days',
    empty: 'No events in this period yet.',
    count: (n: number) => `${n}`,
    register: 'Register',
    free: 'Free',
    paid: 'Paid',
    online: 'Online',
    status: { open: 'Open', approval: 'Approval required', waitlist: 'Waitlist', sold_out: 'Sold out' },
    hiring: (name: string, n: number) => `${name} has ${n} open ${n === 1 ? 'role' : 'roles'}`,
    walk: (name: string, mins: number) => `${mins} min walk from ${name} MRT`,
    addressHidden: 'Address shared after registration',
    by: 'By',
    sourcesTitle: 'Where the events come from',
    sourcesLead: 'Event data comes from open sources and syncs once a day. We do not change event names or times, and we do not collect hosts’ personal profiles.',
    sourceCount: (n: number) => `${n} listed now`,
    sourceMissing: 'Missing an event? Submit it to the AI @ Singapore calendar and it will appear here after the next sync.',
    updated: 'Last synced',
  },
  jobs: {
    title: 'Open roles',
    lead: 'Roles that the companies we track are advertising in Singapore right now. Pick a function or a company in the maps, then read the table below.',
    stats: { roles: 'Open roles', companies: 'Companies hiring', ai: 'AI-related', fresh: 'Posted in 7 days' },
    byFunctionTitle: 'By function',
    byFunctionLead: 'Each row is a function, followed by its most common role titles. Click any item to filter the table.',
    byCompanyTitle: 'By company',
    byCompanyLead: 'Larger names have more open roles. Click a company to filter the table.',
    tableTitle: 'All roles',
    root: 'Open roles',
    search: 'Search roles or companies',
    aiOnly: 'AI-related only',
    clear: 'Clear filters',
    results: (n: number) => `${n} ${n === 1 ? 'role' : 'roles'}`,
    col: { role: 'Role', company: 'Company', fn: 'Function', level: 'Level', posted: 'Posted', verified: 'Verified', apply: 'Apply' },
    apply: 'Apply',
    more: (n: number) => `Show more (${n} left)`,
    empty: 'No roles match. Clear the filters and try again.',
    verifiedNote: 'Roles come from each company’s official careers board and are checked daily. A role missing from two checks in a row is removed.',
    updated: 'Last verified',
  },
  fn: {
    product: 'Product', design: 'Design', ai_ml: 'AI / ML', data: 'Data', software: 'Software / Full-stack',
    infra: 'Infrastructure & Security', solutions: 'Solutions & Delivery', strategy: 'Strategy & Operations',
    gtm: 'Sales & Marketing', corporate: 'Corporate functions', other: 'Other',
  },
  level: { intern: 'Intern', junior: 'Junior', mid: 'Mid', senior: 'Senior', lead: 'Lead / Staff+' },
  footer: {
    line: 'SG AI Oasis is an open-source project by Stay SG. Events and roles update automatically every day.',
    disclaimer: 'Attending an event does not guarantee a referral or an interview. Always check the official page.',
    github: 'GitHub',
  },
};

export type { Dict };
export const getDict = (lang: Lang): Dict => (lang === 'zh' ? zh : en);

const LOCALE: Record<Lang, string> = { zh: 'zh-CN', en: 'en-SG' };
const TZ = 'Asia/Singapore';

export function fmtDay(iso: string, lang: Lang): string {
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00+08:00` : iso);
  return d.toLocaleDateString(LOCALE[lang], { weekday: 'short', month: 'short', day: 'numeric', timeZone: TZ });
}
export function fmtTime(iso: string, lang: Lang): string {
  return new Date(iso).toLocaleTimeString(LOCALE[lang], { hour: 'numeric', minute: '2-digit', hour12: lang === 'en', timeZone: TZ });
}
export function fmtShort(iso: string, lang: Lang): string {
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00+08:00` : iso);
  return d.toLocaleDateString(LOCALE[lang], { month: 'short', day: 'numeric', timeZone: TZ });
}
export function fmtDatePill(iso: string, lang: Lang): string {
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00+08:00` : iso);
  if (lang === 'zh') {
    const parts = new Intl.DateTimeFormat('zh-CN', {
      month: 'numeric', day: 'numeric', weekday: 'short', timeZone: TZ,
    }).formatToParts(d);
    const m = parts.find((p) => p.type === 'month')?.value ?? '';
    const day = parts.find((p) => p.type === 'day')?.value ?? '';
    const wd = parts.find((p) => p.type === 'weekday')?.value ?? '';
    return `${m}/${day} ${wd}`;
  }
  const parts = new Intl.DateTimeFormat('en-SG', {
    month: 'short', day: 'numeric', weekday: 'short', timeZone: TZ,
  }).formatToParts(d);
  const m = parts.find((p) => p.type === 'month')?.value ?? '';
  const day = parts.find((p) => p.type === 'day')?.value ?? '';
  const wd = parts.find((p) => p.type === 'weekday')?.value ?? '';
  return `${m} ${day} · ${wd}`;
}
export function fmtStamp(iso: string | null, lang: Lang): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(LOCALE[lang], { dateStyle: 'medium', timeStyle: 'short', timeZone: TZ });
}
