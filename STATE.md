# 状态

最后更新：2026-11-22 · J7 的 MacBook Pro · Claude

## 下一步

- 正式环境已上线：https://sgaievent.vercel.app （2026-11-22，由本地 `vercel deploy --prod` 发布）。合并 PR https://github.com/NodeXign/sg-ai-oasis/pull/1 后每日定时任务才运行；线上数据在此之前不会自动更新。
- Supabase：在真实项目上按顺序执行 001–004，配置密钥（本机 `.env.local`、Vercel、GitHub Secrets）。四个迁移和两条写库路径都还没在真实项目上跑过，第一次跑要看报错。
- 种子公司与大会名单核对：`data/companies.json` 的 `conferences` 字段仍是空的。
- 活动来源只有两个 Luma 列表，可继续加 Lorong AI、SGInnovate、Eventbrite 等。
- 下一阶段：按简历和目标岗位做私有的个人匹配。

## 已完成

- 2026-11-22：Review 现有产品与架构。
- 2026-11-22：第一周启动版（分支 `feat/jobs-companies-week1`，未提交）：
  - `data/companies.json` 27 家公司；`scripts/jobs_sync.py` 每日核对，首次实跑得到 601 个新加坡在招岗位，其中 149 个 AI 相关，27 家全部读取成功。
  - `supabase/migrations/003_companies_jobs.sql`：companies、jobs、event_companies 三张表，公开只读，外加 `hiring_and_showing_up` 视图。顺带修了 002 里缺失的 `sort_order` 列。尚未在真实 Supabase 项目上执行过。
  - 网站：新增 `/jobs` 页（类别、公司、资历、AI 相关、近 7 天筛选），首页加招聘摘要，活动卡片显示主办公司在招岗位数，三页共用 `SiteHeader`。`npm run build` 通过，本地浏览器检查过桌面和手机宽度。
  - `.github/workflows/jobs.yml` 每日同步；`scripts/weekly_jobs_report.py` 生成固定模板周报，样刊在 `reports/JOB_REPORT_2026-11-22.md`。

- 2026-11-22：按用户反馈整体重构（未提交，上一版已存为检查点提交 1029502）：
  - 中英文两个版本 `/zh`、`/en`；shadcn 风格新设计，强调色 #1257FD。
  - 首页：本周活动地图 + 活动按日期分布 + 岗位按职能分布 +“这周能遇到的招聘公司”+ Tech for Good 说明。
  - 地图原来不显示是因为 CARTO 底图返回占位图，已换成 MapLibre + OpenFreeMap。
  - 活动页：默认本周，可切到 30 天；去掉统计和分布图；底部列出开放来源。`scripts/events_sync.py` 每日从 Luma 两个开放列表同步，当前 19 场。
  - 岗位页：按职能的图谱、按公司的词云、总表；职能细分为 11 类并加了岗位名称归一（roleFamily）。
  - 删除了旧页面、旧组件、旧采集脚本和 recharts / leaflet 依赖。

- 2026-11-22：重构版已提交（e779e60）。补了 `004_events_open_sources.sql`，活动同步可写入 Supabase，网站读活动也支持 Supabase，未配置时回落到 JSON。

- 2026-11-22：分支已推到 NodeXign/sg-ai-oasis 并开 PR #1；Vercel 预览版构建成功。正式环境未发布。

- 2026-11-22：修复生产构建下地图高度为 0（maplibre 自带样式覆盖了定位类，改用内联样式），已发布正式环境并在线上确认地图显示。

## 未决问题

- Vercel 线上是否已配置 Supabase 环境变量，未核实。
- 分支 `redesign/industry-filter` 上原有的未提交改动被带到了新分支，一并在工作区里，提交时需要决定是否分开提交。
- 岗位超过约 5000 个时 `lib/jobs.ts` 的读取需要分页。

## 决定

- 2026-11-22：保留 Supabase 作为唯一数据库（Jobs · Companies · Events）—— 有活动方要 feature 本产品并询问 Supabase 的用法；三类数据需要关联查询。
- 2026-11-22：第一周只跑通“数据源 → 采集核对 → Supabase → 网站 + 周报”，匹配用规则不用 LLM；按简历和目标岗位的个性化推荐放到下一阶段。
- 2026-11-22：在现有仓库上改，不重建。
- 2026-11-22：岗位来源用公司官方招聘接口，LinkedIn 只作人工核对链接 —— 自动抓取 LinkedIn 不稳定且违反其条款。
