#!/usr/bin/env python3
"""
SG AI Oasis — Weekly AI Job Report (fixed template, no LLM).

Reads data/companies.json, data/jobs.json, data/events.json and writes
reports/JOB_REPORT_<date>.md with four sections:
  1. Overview   2. Who's hiring   3. Featured roles (AI-related, by category)
  4. Meet the industry (companies hiring AND hosting an upcoming event)

Usage: python3 scripts/weekly_jobs_report.py
"""
import json
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SGT = timezone(timedelta(hours=8))
LABEL = {
    'product': 'Product 产品', 'solutions': 'Solutions 解决方案', 'strategy': 'Strategy 战略与转型',
    'data': 'Data 数据与研究', 'engineering': 'Engineering 工程', 'gtm': 'GTM 销售与市场', 'other': 'Other',
}
FEATURED_ORDER = ['product', 'strategy', 'solutions', 'data', 'engineering']
PER_CATEGORY = 4


def load(name):
    return json.loads((ROOT / 'data' / name).read_text())


def posted(job):
    raw = job.get('postedAt') or f"{job['firstSeen']}T00:00:00+08:00"
    return datetime.fromisoformat(raw.replace('Z', '+00:00'))


def main():
    now = datetime.now(SGT)
    week_ago = now - timedelta(days=7)
    companies = {c['id']: c for c in load('companies.json')}
    jobs = [j for j in load('jobs.json') if j['status'] == 'open']
    events = load('events.json')

    fresh = [j for j in jobs if posted(j) >= week_ago]
    by_company = Counter(j['companyId'] for j in jobs)
    fresh_by_company = Counter(j['companyId'] for j in fresh)

    lines = [
        f'# Singapore AI Jobs — Week of {now:%Y-%m-%d}',
        '',
        '## 01 Overview 本周概览',
        '',
        f'- 在招岗位：**{len(jobs)}**，来自 **{len(by_company)}** 家公司',
        f'- 近 7 天新发布：**{len(fresh)}**',
        f'- AI 相关岗位：**{sum(1 for j in jobs if j["isAiRelated"])}**',
        f'- 全部岗位均在公司官方招聘页核实，核实日期 {now:%Y-%m-%d}',
        '',
        "## 02 Who's Hiring 招聘公司",
        '',
        '| 公司 | 领域 | 在招 | 近 7 天新增 |',
        '|---|---|---:|---:|',
    ]
    for cid, n in by_company.most_common(12):
        c = companies[cid]
        lines.append(f"| [{c['name']}]({c['careersUrl']}) | {c['sector']} | {n} | {fresh_by_company.get(cid, 0)} |")

    lines += ['', '## 03 Featured Roles 精选岗位', '', '只列 AI 相关岗位，每类按发布时间取最新，每家公司每类最多一个。', '']
    grouped = defaultdict(list)
    for j in sorted((j for j in jobs if j['isAiRelated']), key=posted, reverse=True):
        grouped[j['category']].append(j)
    for cat in FEATURED_ORDER:
        picked, used = [], set()
        for j in grouped.get(cat, []):
            if j['companyId'] in used:
                continue
            used.add(j['companyId'])
            picked.append(j)
            if len(picked) == PER_CATEGORY:
                break
        if not picked:
            continue
        lines += [f'### {LABEL[cat]}', '']
        for j in picked:
            lines.append(f"- **{j['title']}** · {companies[j['companyId']]['name']} · 发布 {posted(j):%m-%d} · [官网投递]({j['applyUrl']})")
        lines.append('')

    lines += ['## 04 Meet the Industry 招人且有活动的公司', '']
    rows = []
    for e in events:
        if datetime.fromisoformat(e['startAt'].replace('Z', '+00:00')) < now:
            continue
        for cid in e.get('companyIds', []):
            if by_company.get(cid):
                day = datetime.fromisoformat(e['startAt'].replace('Z', '+00:00')).astimezone(SGT)
                rows.append(f"- **{companies[cid]['name']}**（{by_company[cid]} 个在招）· {day:%m-%d} · [{e['title']}]({e['url']})")
    lines += rows or ['本周没有同时满足“在招”和“有近期活动”的公司。活动数据更新后这里会自动出现。']
    lines += ['', '---', '数据来源：各公司官方招聘页。参加活动不代表能获得内推或面试。', '']

    out = ROOT / 'reports' / f'JOB_REPORT_{now:%Y-%m-%d}.md'
    out.write_text('\n'.join(lines))
    print(out)


if __name__ == '__main__':
    main()
