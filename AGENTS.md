# SG AI Oasis

## 背景

新加坡 AI 机会地图：活动 × 公司 × 岗位。给在新加坡想进入或转向 AI 行业的人用，也是「人在坡岛」每周内容的数据来源。
根数据是公司名单（`data/companies.json`）。每天核对这些公司在新加坡的在招岗位，活动通过主办方关联到公司。

## 运行与部署

- 本地：`npm install`，`npm run dev`（3000 端口被占用时用 `npm run dev -- -p 3210`）。
- 岗位同步：`python3 scripts/jobs_sync.py`（只用标准库；加 `--dry-run` 不写文件）。
- 周报：`python3 scripts/weekly_jobs_report.py`，输出到 `reports/`。
- 数据库：Supabase。按顺序执行 `supabase/migrations/` 下的 001、002、003。没有配置密钥时网站读 `data/*.json`。
- 定时：`.github/workflows/jobs.yml` 每天 07:00 SGT 同步岗位并提交 JSON；仓库 Secrets 里有 `SUPABASE_URL` 和 `SUPABASE_SERVICE_ROLE_KEY` 时同时写入 Supabase。
- 部署：Vercel，项目名 `sgaievent`。

## 约定

- 岗位只从公司官方招聘页的公开接口读取（Greenhouse / Lever / Ashby）。不抓取 LinkedIn，只生成一个搜索链接供人工核对。
- 分类、资历、AI 标记都是关键词规则，写在 `scripts/jobs_sync.py`，不调用 LLM。
- 岗位连续两次同步都找不到才标记下架；某家公司接口读取失败时，不改动它已有的岗位。
- 简历、求职意向等个人数据不进仓库，也不进公开的表。
- 客户端组件不要从 `lib/jobs.ts` 导入值（会把岗位 JSON 打进前端包），标签用 `lib/job-labels.ts`。

当前进度见 `STATE.md`。
