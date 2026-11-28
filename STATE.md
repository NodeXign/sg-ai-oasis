# 状态

最后更新：2026-11-28 · J7 的 MacBook Pro · Antigravity

## 下一步

- 在手机浏览器实测 `https://sgaioasis.vercel.app/zh/admin`：选择任意日期范围（如 `11/28 – 12/5`），确认图 01 自动加载与网站一致的高清 2D 地图，点击「一键生成 N 张 1080×1440 PNG」后长按图片直接存相册；同时用手机扫码核实图 05 二维码跳转。
- 若需保护 Vercel 线上的 `/api/admin/*` 接口，在 Vercel 环境变量中配置 `ADMIN_PASSWORD` 即可。
- Supabase：在真实项目上按顺序执行 001–004，配置密钥（本机 `.env.local`、Vercel、GitHub Secrets）。
- 种子公司与大会名单核对：`data/companies.json` 的 `conferences` 字段仍是空的。
- 下一阶段：按简历和目标岗位做私有的个人匹配。

## 已完成

- 2026-11-28（Antigravity · 分支 `feat/mobile-readable-typography`）：全面升级手机端路上阅览字号、图文层次与小红书贴文排版（PR #8）：
  - **2D 实景地图大字号升级**（`lib/client-map-snapshot.ts`）：地图浮卡放大至 `248×84px`（标题 `15px` 粗体、日期 `13.5px`、地点 `12.5px`、MRT 与地标 `13–14.5px`、底部图例 `12.5px`），手机端无需放大即可直接看清片区与活动。
  - **活动总览重构为手机友好两行大字版式**（`lib/xhs-life-cards.ts`）：由原先 3 行偏小字（标题 `18px`/元信息 `14.5px`）改为高对比 2 行大字（黑底序号徽章 + 标题 `23–27px` 粗体 + 底部时间地点与适合人群 `19.5–22px`），单页仍稳定容纳 10 场零溢出。
  - **全套海报与贴文排版同步强化**：全局 KPI 数字升至 `44px`、标签 `17.5px`、正文 `28px`、主推标题 `26–35px`、网站功能指南 `24–34px` 并优化孤字换行、移除图 05 示意图里的后台内部提示字；同步升级 `caption.md` 为带标题建议、短段落呼吸感、每图导览、数据速览与小红书话题标签的移动端即用贴文。
  - **实测与逐张目视复核通过**：6 张移动端 PNG（`11/28–12/5` 19 场）与 5 张桌面端 PNG 全部 `1440px` 零溢出、0 报错。

- 2026-11-28（Antigravity · 分支 `fix/balanced-overview-no-friend-tag`）：根据用户视觉复核完成两项收口优化：
  - **活动总览均衡合并（消除稀疏第四页）**：`lib/xhs-life-cards.ts` 改为每页最多 10 场自动均分（如 `11/28–12/5` 19 场由 `7+7+5` 三页合并为第 2、3 页 `10+9` 两页，整套由 7 页缩为紧凑 6 页），新增 9–10 场紧凑字号档位并修复少于 5 场时卡片被过度拉开的留白问题。
  - **公开海报与配文全面隐藏“朋友主办”标签**：移除地图浮卡、图 01/03 KPI、总览页、主推卡片及配文中的「朋友 / 朋友主办 / 朋友局」公开标示（改为正常主题分类如 `AI 职场 · 创业对话` 及「免费公开场次」「覆盖活动天数」等通用统计），仅在后台管理界面保留「朋友」筛选与标识。
  - **双场景 E2E 与逐张目视复核通过**：实测 `11/28–12/5`（19 场 → 6 张 `1080×1440` PNG）与 `11/27–11/29`（7 场 → 5 张 PNG）全部 `1440px` 零溢出、0 报错。

- 2026-11-28（Antigravity · 分支 `feat/mobile-map-and-full-export`）：解决手机端/Vercel 线上地图不全、导出海报遗漏日期活动、以及移动端无法出 PNG 三大核心痛点：
  - **全端通用浏览器原生 2D 地图引擎**（`lib/client-map-snapshot.ts`）：直接在用户浏览器（iPhone / Android / 桌面 / Vercel 无 Playwright 环境）用 MapLibre GL OpenFreeMap Positron 底图 + `944×720`（2× Retina `1888×1440`）离屏合成与网站风格完全一致的实景 2D 地图（含完整海岸线/路网、MRT 站、片区地标、实线/虚线活动卡片、防重叠避让、底部图例），`fitBounds` 覆全岛并放宽首页 `EventMap.tsx` 边缘留白，彻底消除灰边与 NTU/东海岸裁切。
  - **所选日期 100% 全量覆盖（自动分页）**（`lib/xhs-life-cards.ts`）：`includeOverflowChecklist` 默认开启；超过 8 场活动时自动按时间顺序将图 02 拆分为每页 7 场的连续总览页（`1/3 · 11/28–12/1`、`2/3 · 12/1–12/3`、`3/3 · 12/3–12/5`），确保所选日期每一场活动都出现在成品海报上（≤ 8 场保持精准 5 页 40/20/40 配比）；单场地图编号与总览页编号一致，聚落点清晰标示 `5场`/`2场`。
  - **Vercel/手机端一键生成 1080×1440 PNG + 长按存相册**（`lib/client-card-png.ts` + `app/api/admin/image-proxy/route.ts` + `components/XhsAdminStudio.tsx`）：新增同源白名单图片代理绕过 Luma/GDG 海报 CORS 污染，浏览器原生 `html-to-image` 无 Playwright 亦可直出全部 `1080×1440` 成品 PNG 并提供手机长按存相册画廊；本机 Mac 仍自动优先走 Playwright 落盘保存完整导出包。
  - **双场景 E2E 与目视复核通过**：模拟 Vercel + 390×844 手机视口（`11/28–12/5` 19 场 → 7 张 `1080×1440` PNG，含 Luma/GDG/NTU 展板）与桌面端（`11/27–11/29` 7 场 → 5 张 PNG）均 0 报错、`1440px` 零溢出，并逐张目视审查确认地图细节完整、无遮挡。

- 2026-11-28（Antigravity · 分支 `feat/xhs-life-admin`）：完成图 01 真实 2D 网站地图自动联动（`EventMap` 支持 `hideControls`、`/admin/map-shot` 精确匹配 `944×630` 无裁切比例、后台选活动/日期自动防抖抓取 2D 地图并在导出 PNG 前自动确保最新）并保留 `data/friend_events.json` 中的 NTU 活动；提交 PR #5 并合并上线 `master`。

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
