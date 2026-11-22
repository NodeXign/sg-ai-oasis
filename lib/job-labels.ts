// Kept apart from lib/jobs.ts so client components don't pull the jobs JSON into their bundle.
export const CATEGORY_LABEL: Record<string, string> = {
  product:     '产品 Product',
  solutions:   '解决方案 Solutions',
  strategy:    '战略与转型 Strategy',
  data:        '数据与研究 Data',
  engineering: '工程 Engineering',
  gtm:         '销售与市场 GTM',
  other:       '其他 Other',
};
