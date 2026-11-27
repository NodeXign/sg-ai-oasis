# 状态

最后更新：2026-11-27 · J7 的 MacBook Pro · Antigravity

## 下一步

- 线上访问 `https://sgaioasis.vercel.app/zh/admin` 确认生产环境可用，并用手机扫码实测图 05 二维码跳转（`https://sgaioasis.vercel.app/zh` 已返回 HTTP 200）。
- 若需保护 Vercel 线上的 `/api/admin/*` 接口，在 Vercel 环境变量中配置 `ADMIN_PASSWORD` 即可。
- Supabase：在真实项目上按顺序执行 001–004，配置密钥（本机 `.env.local`、Vercel、GitHub Secrets）。
- 种子公司与大会名单核对：`data/companies.json` 的 `conferences` 字段仍是空的。
- 下一阶段：按简历和目标岗位做私有的个人匹配。

## 已完成

- 2026-11-28（Antigravity · 分支 `feat/xhs-life-admin`）：完成图 01 真实 2D 网站地图自动联动（`EventMap` 支持 `hideControls`、`/admin/map-shot` 精确匹配 `944×630` 无裁切比例、后台选活动/日期自动防抖抓取 2D 地图并在导出 PNG 前自动确保最新）并保留 `data/friend_events.json` 中的 NTU 活动；提交 PR 并合并上线 `master`。

- 2026-11-28（Antigravity · 分支 `feat/xhs-life-admin`，未提交）：完成第三轮细节打磨与主域名对齐：
  - **图 02 动态适配 1–8 场（解决 11/29 被截断问题）**：按 `1–5 / 6 / 7–8` 三档密度自适应，实测 `11/27–11/29` 全部 7 场（含朋友导入的 NTU 活动与 11/29 活动）一页完整展示无压脚；超过 8 场按日期轮询均衡覆盖。
  - **图 03 改为 1–3 场主推 + 官方活动展板图**：透传 Luma / GDG / 朋友导入的真实 `coverImageUrl`（Luma 解析同步提取 `description_mirror` 摘要，后台支持单场自定义上传替换展板），按选 1 / 2 / 3 场自动切换专属杂志展板版式；实测单场（NTU 海报展板）与三场（NTU + DevFest 双展板）均 `1440px` 零溢出。
  - **主域名统一对齐 `sgaioasis.vercel.app` & SEO**：新增 `app/robots.ts`、`app/sitemap.ts` 与 `metadataBase`；图 05 默认网址、二维码与搜索词切换为 `sgaioasis.vercel.app/zh`（待用户在 Vercel 后台 Domains 添加 `sgaioasis.vercel.app` 并将 `sgaievent.vercel.app` 301 重定向至主域名）。
- 2026-11-27（Antigravity · 分支 `feat/xhs-life-admin`，未提交）：按用户视觉评审迭代小红书 Life 导出后台与 5 页模板（第二轮）：
  - **智能一键导入（链接 / 文字 / 海报图片）**：新增 `scripts/macos_ocr.jxa`（macOS 原生 Apple Vision 中英 OCR，免 API key）、`lib/event-parser.ts` 与 `/api/admin/parse-event`；支持 Luma 活动页 API 直解析、通用 JSON-LD/OpenGraph 网页解析、中英文微信/WhatsApp 文案提取、海报图片拖拽/`Cmd+V` 粘贴截图识别，并提供「⚡ 一键解析并直接导入」与「仅解析填表」。
  - **5 页结构与视觉全面重构（精准 40/20/40 Life 配比，底部占满无多余留白）**：
    - `01`（Hairline）：按所选活动实时联动的新加坡坐标矢量地图（支持一键截取真实 2D 网站地图 `/api/admin/capture-site` + `/[lang]/admin/map-shot`）+ KPI 与片区速览。
    - `02`（Notionaly）：本期活动总览（自动规则推断 + 可编辑的「适合人群 & 兴趣标签」）+ Notionaly 人物插画。
    - `03`（Diagram Design）：热度/在招/免费关键数据统计 + 本期重点主推活动（可自定义统计高亮条）。
    - `04`（Notionaly）：可自由编辑的本期网站特辑（主办方在招直连 + GO/NOGO 小工具），支持一键截取本机 GO/NOGO 真实界面或上传自定义截图。
    - `05`（Hairline）：网站 4 大功能指南（机会地图 / 近期活动 / 在招岗位 / GO/NOGO）+ `qrcode` 生成的真实可扫描内联 SVG 二维码与搜索关键词引导。
  - **全链路实测通过**：`npm run build` 零报错；实测 Luma URL、中文微信文案、海报 Vision OCR、2D 地图截图、GO/NOGO 截图与全套 `exports/xhs-life-2026-11-27_to_2026-12-03/01.png ~ 05.png` 渲染及逐张目视复核（全部 `1440px` 无溢出、无重叠）。
- 2026-11-27（Antigravity · 分支 `feat/xhs-life-admin`，未提交）：基于现有站点新增「小红书 Life 导出后台与朋友活动管理」（`/[lang]/admin`）：
  - **日期筛选与活动策展**：按 SGT 起止日期筛选（含未来 7 天 / 周日→周日周报窗口 / 14 天 / 30 天快捷预设），支持勾选、★ 精选（最多 4 场）与自定义「适合 / 亮点」备注。
  - **朋友活动后台导入**：新增独立数据文件 `data/friend_events.json` 与 `/api/admin/friend-events`（增删改查、粘贴文案规则提取、JSON 导入导出、自动地理匹配 MRT/片区，可选 `publishToSite` 决定是否同步显示到公开站；只读环境自动降级浏览器 `localStorage`）。
  - **Diagramme Life 图文与配文引擎**（`lib/xhs-life-cards.ts`）：严格对齐 `PORTABLE_SPEC.md`、`card-shell.html`、`personal-style.md`、`tone-and-caption.md`，固定 `1080 × 1440`、白底暖黑辅助灰、左上「人在坡岛」黑胶囊 + 右上内联 SVG「Stay SG」Logo、左下仅主题（带违禁口吻词实时校验）+ 右下两位数页码；默认 5 页精准命中 Life 40% Notionaly / 20% Diagram Design / 40% Hairline，末页提供 `.prompt-box` 速查清单，支持编辑每页 HTML 源码与上传自定义封面 PNG，自动生成 `caption.md` 与 `diagramme-usage.json`。
  - **一键渲染与验证**（`/api/admin/export-pack`）：本地已验证 `npm run build` 通过、Playwright + Chrome 实测渲染 `exports/xhs-life-2026-11-27_to_2026-12-03/01.png ~ 05.png` 并逐张视觉复核（修复了第 02 页等轴测片区标签重叠与日期月/日口径不一致问题，全部 `scrollHeight === 1440px` 无溢出）。明确标注仅用于生成图文、配文与审阅，不含自动发布小红书。
- 2026-11-27（Windows Codex/Antigravity）：合并 PR #2–#4（扩充活动源与公司招聘看板、GO/NOGO 决策页、互动地图升级、默认 2D 地图）并部署 `https://sgaievent.vercel.app`（`master` `898eeb1`）。
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
