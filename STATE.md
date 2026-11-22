# 状态

最后更新：2026-11-22 · J7 的 MacBook Pro · Claude

## 下一步

- 用户在 Supabase SQL 编辑器执行 `supabase/migrations/003_companies_jobs.sql`（001、002 未执行过的话先执行），把地址和密钥放进本机 `.env.local`、Vercel 环境变量和 GitHub Secrets，然后跑一次 `python3 scripts/jobs_sync.py` 写库。
- 更新活动数据：`data/events.json` 仍是 6 月的 12 场，首页显示“0 场活动”。把周报自动化的活动结果写进同一份数据（Supabase `events`），停用各期目录里单独的 `event_data.py`。
- 种子公司与大会名单核对：`data/companies.json` 的 `conferences` 字段现在是空的，27 家是按“公开招聘接口可读且当前在新加坡有岗位”选的。
- 提交并合并分支 `feat/jobs-companies-week1`；定时任务只在默认分支上运行。
- 下一阶段：按简历和目标岗位做私有的个人匹配（Direct / Adjacent / Stretch）。

## 已完成

- 2026-11-22：Review 现有产品与架构。
- 2026-11-22：第一周启动版（分支 `feat/jobs-companies-week1`，未提交）：
  - `data/companies.json` 27 家公司；`scripts/jobs_sync.py` 每日核对，首次实跑得到 601 个新加坡在招岗位，其中 149 个 AI 相关，27 家全部读取成功。
  - `supabase/migrations/003_companies_jobs.sql`：companies、jobs、event_companies 三张表，公开只读，外加 `hiring_and_showing_up` 视图。顺带修了 002 里缺失的 `sort_order` 列。尚未在真实 Supabase 项目上执行过。
  - 网站：新增 `/jobs` 页（类别、公司、资历、AI 相关、近 7 天筛选），首页加招聘摘要，活动卡片显示主办公司在招岗位数，三页共用 `SiteHeader`。`npm run build` 通过，本地浏览器检查过桌面和手机宽度。
  - `.github/workflows/jobs.yml` 每日同步；`scripts/weekly_jobs_report.py` 生成固定模板周报，样刊在 `reports/JOB_REPORT_2026-11-22.md`。

## 未决问题

- Vercel 线上是否已配置 Supabase 环境变量，未核实。
- 分支 `redesign/industry-filter` 上原有的未提交改动被带到了新分支，一并在工作区里，提交时需要决定是否分开提交。
- 岗位超过约 5000 个时 `lib/jobs.ts` 的读取需要分页。

## 决定

- 2026-11-22：保留 Supabase 作为唯一数据库（Jobs · Companies · Events）—— 有活动方要 feature 本产品并询问 Supabase 的用法；三类数据需要关联查询。
- 2026-11-22：第一周只跑通“数据源 → 采集核对 → Supabase → 网站 + 周报”，匹配用规则不用 LLM；按简历和目标岗位的个性化推荐放到下一阶段。
- 2026-11-22：在现有仓库上改，不重建。
- 2026-11-22：岗位来源用公司官方招聘接口，LinkedIn 只作人工核对链接 —— 自动抓取 LinkedIn 不稳定且违反其条款。
