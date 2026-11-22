# SG AI Oasis

## 背景

新加坡 AI 机会地图：活动 × 公司 × 岗位。给在新加坡想进入或转向 AI 行业的人用，也是「人在坡岛」每周内容的数据来源。
根数据是公司名单（`data/companies.json`）。每天核对这些公司在新加坡的在招岗位，活动通过主办方关联到公司。

## 运行与部署

- 本地：`npm install`，`npm run dev`（3000 端口被占用时用 `npm run dev -- -p 3210`）。
- 岗位同步：`python3 scripts/jobs_sync.py`；活动同步：`python3 scripts/events_sync.py`（都只用标准库，加 `--dry-run` 不写文件）。
- 周报：`python3 scripts/weekly_jobs_report.py`，输出到 `reports/`。
- 数据库：Supabase。按顺序执行 `supabase/migrations/` 下的 001、002、003。没有配置密钥时网站读 `data/*.json`。活动目前只读 JSON。
- 定时：`.github/workflows/daily-sync.yml` 每天 07:00 SGT 同步岗位和活动并提交 JSON。
- 部署：Vercel，项目名 `sgaievent`。

## 约定

- 两个语言版本 `/zh` 和 `/en`，界面文字全部在 `lib/i18n.ts`，一个版本里不混用两种语言。活动名称和岗位名称保持官方原文，不翻译。
- 设计：shadcn 风格的中性色，唯一强调色 `#1257FD`，样式类集中在 `app/globals.css`。
- 地图用 MapLibre + OpenFreeMap 底图（免密钥）。不要换回 CARTO，它的免密钥瓦片已返回占位图。
- 岗位只从公司官方招聘页的公开接口读取（Greenhouse / Lever / Ashby）。不抓取 LinkedIn。
- 活动只从 `data/sources.json` 里列出的开放来源读取；只保存主办机构名称，不保存主办人个人信息。主办方隐藏地址的活动不上地图。
- 分类、资历、AI 标记、活动与公司的关联都是关键词规则，不调用 LLM。
- 岗位连续两次同步都找不到才标记下架；某个来源读取失败时，不改动它已有的数据。
- 简历、求职意向等个人数据不进仓库，也不进公开的表。
- 客户端组件不要导入 `lib/jobs.ts` 或 `lib/events.ts`（会把数据 JSON 打进前端包）。

当前进度见 `STATE.md`。
