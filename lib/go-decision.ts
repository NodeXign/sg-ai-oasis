import type { Lang, SgEvent } from './types';
import { getDict } from './i18n';

export interface HiringCompanyBrief {
  id: string;
  name: string;
  sector: string;
  aiFocus: string;
  openRoles: number;
}

export interface EventEvalContext {
  id: string;
  title: string;
  startAt: string;
  endAt?: string | null;
  whenLabel: string;
  venue: string;
  isOnline: boolean;
  mrtName?: string;
  mrtWalkMins?: number;
  organiser: string;
  tags: string[];
  isFree: boolean | null;
  price?: string | null;
  status: SgEvent['status'];
  url: string;
  hiringCompanies: HiringCompanyBrief[];
}

export type KeywordCategory = 'ai_tech' | 'industry' | 'career' | 'personal';
export type DimensionKey = 'learning' | 'networking' | 'career';
export type DecisionVerdict = 'go' | 'edge' | 'not_go';
export type FinalChoice = 'go' | 'skip' | null;
export type ReflectionFramework = 'first_principles' | 'socratic' | 'dyl';
export type EnergyLevel = 'drained' | 'neutral' | 'energized';

export interface KeywordPreset {
  id: string;
  category: KeywordCategory;
  matchTerms: string[];
}

export interface DimensionScores {
  learning: number;
  networking: number;
  career: number;
}

export interface DimensionEstimate {
  score: number;
  reasons: string[];
  lowConfidence: boolean;
  infoNotice?: string;
}

export interface RuleEvaluation {
  suggested: Record<DimensionKey, DimensionEstimate>;
  matchedKeywordIds: string[];
  matchedCustomKeywords: string[];
  relevantPresetIds: string[];
  relevantCustomKeywords: string[];
}

export interface TimeCommitment {
  eventHours: number;
  commuteHours: number;
  totalHours: number;
  isEstimatedDuration: boolean;
}

export interface DecisionOutcome {
  total: number;
  verdict: DecisionVerdict;
  rationale: string;
  time: TimeCommitment;
  prompt: {
    framework: ReflectionFramework;
    question: string;
  };
}

export interface DecisionRecord {
  eventId: string;
  eventTitle: string;
  scores: DimensionScores;
  total: number;
  verdict: DecisionVerdict;
  finalChoice: FinalChoice;
  selectedKeywords: string[];
  attended: boolean;
  updatedAt: string;
}

export interface ReflectionRecord {
  eventId: string;
  takeaway: string;
  connection: string;
  followUp: string;
  energy?: EnergyLevel;
  actualHours?: string;
  updatedAt: string;
}

export interface UserKeywordPrefs {
  selectedIds: string[];
  customKeywords: string[];
}

export const WEIGHTS: Record<DimensionKey, number> = {
  learning: 0.5,
  networking: 0.15,
  career: 0.35,
};

export const KEYWORD_CATEGORIES: KeywordCategory[] = ['ai_tech', 'industry', 'career', 'personal'];

export const KEYWORD_PRESETS: KeywordPreset[] = [
  // AI & Tech
  { id: 'llm_agents', category: 'ai_tech', matchTerms: ['llm', 'agent', 'agentic', 'mcp', 'claude', 'gpt', 'openai', 'anthropic', 'gemini', 'copilot', 'langgraph', 'langchain', 'workflow', '智能体', '大模型'] },
  { id: 'rag_search', category: 'ai_tech', matchTerms: ['rag', 'retrieval', 'vector', 'embedding', 'search', 'knowledge graph', 'database', 'pinecone', 'elastic', '检索'] },
  { id: 'multimodal', category: 'ai_tech', matchTerms: ['multimodal', 'vision', 'voice', 'audio', 'video', 'image', 'diffusion', 'genai', 'generative', 'creative ai', '多模态', '生成式'] },
  { id: 'ai_eng', category: 'ai_tech', matchTerms: ['mlops', 'engineering', 'engineer', 'eval', 'evals', 'inference', 'fine-tuning', 'finetune', 'production', 'deploy', 'kubernetes', 'gpu', 'cursor', 'vibe coding', 'coding', 'dev', 'developer'] },
  { id: 'open_source', category: 'ai_tech', matchTerms: ['open source', 'open-source', 'oss', 'hugging face', 'huggingface', 'llama', 'deepseek', 'qwen', 'mistral', 'local ai', 'ollama', '开源'] },
  { id: 'ai_safety', category: 'ai_tech', matchTerms: ['safety', 'governance', 'ethics', 'policy', 'regulation', 'trust', 'security', 'alignment', 'responsible ai', 'privacy', '治理', '安全'] },
  { id: 'robotics', category: 'ai_tech', matchTerms: ['robot', 'robotics', 'embodied', 'hardware', 'edge ai', 'iot', 'chip', 'semiconductor', 'nvidia', 'autonomous', '具身', '机器人'] },
  // Industry
  { id: 'fintech', category: 'industry', matchTerms: ['fintech', 'finance', 'banking', 'quant', 'trading', 'payments', 'crypto', 'web3', 'defi', 'insurance', 'wealth', '金融'] },
  { id: 'enterprise_saas', category: 'industry', matchTerms: ['enterprise', 'b2b', 'saas', 'automation', 'productivity', 'erp', 'crm', 'ops', 'operations', 'supply chain', '企业'] },
  { id: 'healthcare', category: 'industry', matchTerms: ['health', 'healthcare', 'medtech', 'biotech', 'bio', 'clinical', 'pharma', 'medical', 'longevity', '医疗'] },
  { id: 'consumer_media', category: 'industry', matchTerms: ['consumer', 'media', 'content', 'marketing', 'ecommerce', 'e-commerce', 'retail', 'gaming', 'social', 'creator', '消费', '内容'] },
  { id: 'cloud_infra', category: 'industry', matchTerms: ['cloud', 'aws', 'gcp', 'google cloud', 'azure', 'cloudflare', 'data center', 'infra', 'infrastructure', 'platform', 'databricks', 'snowflake'] },
  { id: 'startups_vc', category: 'industry', matchTerms: ['startup', 'startups', 'vc', 'venture', 'investor', 'fundraising', 'pitch', 'accelerator', 'incubator', 'demo day', 'antler', 'entrepreneur', '创业', '投资'] },
  // Career Development
  { id: 'job_search', category: 'career', matchTerms: ['hiring', 'career', 'careers', 'job', 'jobs', 'talent', 'recruit', 'recruiting', 'interview', 'resume', '求职', '招聘'] },
  { id: 'career_pivot', category: 'career', matchTerms: ['transition', 'pivot', 'beginner', 'intro', '101', 'bootcamp', 'upskill', 'career', 'switch', '转型', '入门'] },
  { id: 'founder_building', category: 'career', matchTerms: ['founder', 'founders', 'indie', 'builder', 'builders', 'ship', 'mvp', 'launch', 'solopreneur', 'zero to one', '独立开发'] },
  { id: 'product_design', category: 'career', matchTerms: ['product', 'pm', 'design', 'ux', 'ui', 'figma', 'prototype', 'prototyping', 'user research', '产品', '设计'] },
  { id: 'gtm_partnerships', category: 'career', matchTerms: ['gtm', 'sales', 'growth', 'marketing', 'partnerships', 'bd', 'business development', 'go-to-market', 'revenue', '增长', '销售'] },
  { id: 'research_academia', category: 'career', matchTerms: ['research', 'paper', 'papers', 'reading group', 'lab', 'university', 'nus', 'ntu', 'smu', 'sutd', 'a*star', 'phd', 'science', '论文', '研究'] },
  // Personal Growth
  { id: 'hands_on', category: 'personal', matchTerms: ['workshop', 'hands-on', 'hands on', 'lab', 'build', 'hackathon', 'hack', 'coding', 'tutorial', 'bootcamp', 'sandbox', '工作坊', '实战'] },
  { id: 'community_friends', category: 'personal', matchTerms: ['meetup', 'community', 'mixer', 'social', 'coffee', 'breakfast', 'drinks', 'networking', 'salon', 'club', 'friends', '社区', '聚会'] },
  { id: 'public_speaking', category: 'personal', matchTerms: ['lightning talk', 'open mic', 'demo', 'showcase', 'pitch', 'storytelling', 'speaking', 'toastmasters', '分享'] },
  { id: 'tech_for_good', category: 'personal', matchTerms: ['for good', 'social impact', 'climate', 'sustainability', 'education', 'civic', 'nonprofit', 'inclusive', 'women in', 'diversity', '公益'] },
  { id: 'side_projects', category: 'personal', matchTerms: ['hackathon', 'weekend', 'side project', 'ship', 'buildathon', 'vibe', 'prototype', 'demo night', '黑客松'] },
];

const HANDS_ON_TERMS = ['workshop', 'hands-on', 'hands on', 'hackathon', 'buildathon', 'lab', 'tutorial', 'deep dive', 'deep-dive', 'bootcamp', 'code', 'build', 'demo', 'masterclass', '实战', '工作坊'];
const TALK_TERMS = ['talk', 'panel', 'fireside', 'summit', 'conference', 'symposium', 'forum', 'seminar', 'lecture', 'keynote', 'reading group', '分享', '峰会', '论坛'];
const MIXER_TERMS = ['mixer', 'happy hour', 'drinks', 'pub', 'social', 'party', 'afterparty', 'dinner', 'lunch', 'breakfast', 'coffee', '酒会', '聚餐'];
const COMMUNITY_TERMS = ['meetup', 'community', 'networking', 'mixer', 'salon', 'demo day', 'demo night', 'builders', 'founders', 'roundtable', 'hackathon', 'coffee', '社区', '交流'];
const WEBINAR_TERMS = ['webinar', 'livestream', 'live stream', 'broadcast', 'online talk', '直播'];
const CAREER_TERMS = ['hiring', 'career', 'talent', 'founder', 'product', 'engineering', 'builders', 'startup', 'demo', 'pitch', 'enterprise', 'leader', '求职', '招聘'];

function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(n)));
}

function normalizeText(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

function buildEventCorpus(event: EventEvalContext): string {
  const companyParts = event.hiringCompanies.flatMap((c) => [c.name, c.sector, c.aiFocus]);
  return normalizeText([event.title, event.organiser, event.venue, ...event.tags, ...companyParts].join(' '));
}

function includesTerm(corpus: string, term: string): boolean {
  const t = normalizeText(term);
  if (!t) return false;
  // For very short ASCII tokens (<= 3 chars like 'pm', 'vc', 'ai', 'rag', 'llm'), enforce word boundaries.
  if (/^[a-z0-9]{1,3}$/.test(t)) {
    return new RegExp(`(^|[^a-z0-9])${t}([^a-z0-9]|$)`).test(corpus);
  }
  return corpus.includes(t);
}

function hasAnyTerm(corpus: string, terms: string[]): boolean {
  return terms.some((t) => includesTerm(corpus, t));
}

export function findRelevantKeywords(
  event: EventEvalContext,
  customKeywords: string[],
): { relevantPresetIds: string[]; relevantCustomKeywords: string[] } {
  const corpus = buildEventCorpus(event);
  const relevantPresetIds = KEYWORD_PRESETS.filter((kw) => hasAnyTerm(corpus, kw.matchTerms)).map((kw) => kw.id);
  const relevantCustomKeywords = customKeywords.filter((kw) => includesTerm(corpus, kw));
  return { relevantPresetIds, relevantCustomKeywords };
}

export function evaluateEventRules(
  event: EventEvalContext,
  selectedIds: string[],
  customKeywords: string[],
  lang: Lang,
): RuleEvaluation {
  const dict = getDict(lang).gonogo;
  const r = dict.reasons;
  const corpus = buildEventCorpus(event);
  const { relevantPresetIds, relevantCustomKeywords } = findRelevantKeywords(event, customKeywords);

  const selectedSet = new Set(selectedIds);
  const presetById = new Map(KEYWORD_PRESETS.map((k) => [k.id, k]));

  const matchedKeywordIds = relevantPresetIds.filter((id) => selectedSet.has(id));
  const matchedCustomKeywords = relevantCustomKeywords.filter((kw) => selectedSet.has(`custom:${kw}`));

  const labelForId = (id: string) => dict.keywords[id] ?? id;
  const matchedLearningNames: string[] = [];
  const matchedCareerNames: string[] = [];
  let networkingKeywordBonus = 0;

  matchedKeywordIds.forEach((id) => {
    const preset = presetById.get(id);
    if (!preset) return;
    const label = labelForId(id);
    if (preset.category === 'ai_tech' || preset.category === 'industry' || preset.category === 'personal') {
      matchedLearningNames.push(label);
    }
    if (preset.category === 'career' || preset.category === 'industry' || preset.category === 'ai_tech') {
      matchedCareerNames.push(label);
    }
    if (['community_friends', 'founder_building', 'gtm_partnerships', 'startups_vc', 'public_speaking'].includes(id)) {
      networkingKeywordBonus = Math.min(10, networkingKeywordBonus + 6);
    }
  });

  matchedCustomKeywords.forEach((kw) => {
    matchedLearningNames.push(kw);
    matchedCareerNames.push(kw);
  });

  // 1. Learning Value (50% weight)
  let learning = 50;
  const learningReasons: string[] = [];
  let learningSignals = 0;

  if (hasAnyTerm(corpus, HANDS_ON_TERMS)) {
    learning += 18;
    learningSignals += 1;
    learningReasons.push(r.handsOnFormat);
  } else if (hasAnyTerm(corpus, TALK_TERMS)) {
    learning += 9;
    learningSignals += 1;
    learningReasons.push(r.talkFormat);
  } else if (hasAnyTerm(corpus, MIXER_TERMS)) {
    learning -= 10;
    learningSignals += 1;
    learningReasons.push(r.mixerFormat);
  }

  if (matchedLearningNames.length > 0) {
    learning += Math.min(28, matchedLearningNames.length * 12);
    learningSignals += 1;
    learningReasons.push(r.keywordMatches(matchedLearningNames.slice(0, 3).join(' · ')));
  }

  const learningLowConfidence = learningSignals === 0;

  // 2. Networking Potential (15% weight)
  let networking = 50;
  const networkingReasons: string[] = [];
  let networkingSignals = 0;

  if (event.isOnline) {
    networking -= 16;
    networkingSignals += 1;
    networkingReasons.push(r.onlineOnly);
  } else {
    networking += 10;
    networkingSignals += 1;
    networkingReasons.push(r.inPerson);
  }

  if (hasAnyTerm(corpus, COMMUNITY_TERMS)) {
    networking += 14;
    networkingSignals += 1;
    networkingReasons.push(r.communityFormat);
  } else if (hasAnyTerm(corpus, WEBINAR_TERMS)) {
    networking -= 10;
    networkingSignals += 1;
    networkingReasons.push(r.webinarFormat);
  }

  if (event.hiringCompanies.length > 0) {
    networking += 10;
    networkingSignals += 1;
    const summary = event.hiringCompanies.slice(0, 2).map((c) => dict.contextHiring(c.name, c.openRoles)).join(', ');
    networkingReasons.push(r.hiringLinked(summary));
  } else if (event.organiser) {
    networking += 4;
    networkingReasons.push(r.organiserKnown(event.organiser));
  }

  if (!event.isOnline && event.mrtName && event.mrtWalkMins != null && event.mrtWalkMins <= 15) {
    networking += event.mrtWalkMins <= 10 ? 5 : 2;
    networkingReasons.push(r.mrtNear(event.mrtName, event.mrtWalkMins));
  }

  if (networkingKeywordBonus > 0) {
    networking += networkingKeywordBonus;
  }

  if (event.status === 'sold_out') {
    networking -= 8;
    networkingReasons.push(r.soldOutNote);
  }

  const networkingLowConfidence = networkingSignals <= 1 && !event.organiser;

  // 3. Career Alignment (35% weight)
  let career = 45;
  const careerReasons: string[] = [];
  let careerSignals = 0;

  if (event.hiringCompanies.length > 0) {
    const totalRoles = event.hiringCompanies.reduce((acc, c) => acc + c.openRoles, 0);
    career += event.hiringCompanies.length > 1 || totalRoles >= 5 ? 32 : 25;
    careerSignals += 1;
    const summary = event.hiringCompanies.slice(0, 2).map((c) => dict.contextHiring(c.name, c.openRoles)).join(', ');
    careerReasons.push(r.hiringLinked(summary));
  }

  if (matchedCareerNames.length > 0) {
    career += Math.min(25, matchedCareerNames.length * 10);
    careerSignals += 1;
    careerReasons.push(r.keywordMatches(matchedCareerNames.slice(0, 3).join(' · ')));
  }

  if (hasAnyTerm(corpus, CAREER_TERMS)) {
    career += 7;
    careerSignals += 1;
    careerReasons.push(r.careerSignal);
  }

  const careerLowConfidence = careerSignals === 0;

  return {
    suggested: {
      learning: {
        score: clamp(learning),
        reasons: learningReasons,
        lowConfidence: learningLowConfidence,
        infoNotice: learningLowConfidence ? r.lowInfoLearning : undefined,
      },
      networking: {
        score: clamp(networking),
        reasons: networkingReasons,
        lowConfidence: networkingLowConfidence,
        infoNotice: r.lowInfoNetworking,
      },
      career: {
        score: clamp(career),
        reasons: careerReasons,
        lowConfidence: careerLowConfidence,
        infoNotice: careerLowConfidence ? r.lowInfoCareer : undefined,
      },
    },
    matchedKeywordIds,
    matchedCustomKeywords,
    relevantPresetIds,
    relevantCustomKeywords,
  };
}

export function computeWeightedTotal(scores: DimensionScores): number {
  return clamp(
    scores.learning * WEIGHTS.learning +
    scores.networking * WEIGHTS.networking +
    scores.career * WEIGHTS.career,
  );
}

export function verdictFromScore(total: number): DecisionVerdict {
  if (total >= 68) return 'go';
  if (total >= 48) return 'edge';
  return 'not_go';
}

export function estimateTimeCommitment(event: EventEvalContext): TimeCommitment {
  let eventHours = 2;
  let isEstimatedDuration = true;

  if (event.startAt && event.endAt) {
    const start = new Date(event.startAt).getTime();
    const end = new Date(event.endAt).getTime();
    const diffH = (end - start) / (1000 * 60 * 60);
    if (Number.isFinite(diffH) && diffH >= 0.5 && diffH <= 12) {
      eventHours = Math.round(diffH * 2) / 2;
      isEstimatedDuration = false;
    }
  }

  let commuteHours = 0;
  if (!event.isOnline) {
    const walkRoundTripHours = event.mrtWalkMins != null ? (event.mrtWalkMins * 2) / 60 : 0.25;
    // Standard Singapore MRT round-trip (~45 min) + walking
    commuteHours = Math.round((0.75 + walkRoundTripHours) * 2) / 2;
    if (commuteHours < 0.5) commuteHours = 0.5;
  }

  const totalHours = Math.round((eventHours + commuteHours) * 2) / 2;
  return { eventHours, commuteHours, totalHours, isEstimatedDuration };
}

export function buildDecisionOutcome(
  event: EventEvalContext,
  scores: DimensionScores,
  ruleEval: RuleEvaluation,
  lang: Lang,
): DecisionOutcome {
  const dict = getDict(lang).gonogo;
  const total = computeWeightedTotal(scores);
  const verdict = verdictFromScore(total);
  const time = estimateTimeCommitment(event);

  const dims: { key: DimensionKey; score: number; name: string }[] = [
    { key: 'learning', score: scores.learning, name: dict.dimensions.learning.name },
    { key: 'networking', score: scores.networking, name: dict.dimensions.networking.name },
    { key: 'career', score: scores.career, name: dict.dimensions.career.name },
  ];
  const sorted = [...dims].sort((a, b) => b.score - a.score);
  const strongest = sorted[0];
  const weakest = sorted[sorted.length - 1];

  const matchedNames = [
    ...ruleEval.matchedKeywordIds.map((id) => dict.keywords[id] ?? id),
    ...ruleEval.matchedCustomKeywords,
  ].slice(0, 3);

  const sep = lang === 'zh' ? '，' : '; ';
  let rationale = `${dict.rationaleParts.strongest(strongest.name, strongest.score)}${sep}${dict.rationaleParts.weakest(weakest.name, weakest.score)}`;
  if (event.hiringCompanies.length > 0) {
    rationale += dict.rationaleParts.withHiring(event.hiringCompanies.slice(0, 2).map((c) => c.name).join(' / '));
  }
  if (matchedNames.length > 0) {
    rationale += dict.rationaleParts.withKeywords(matchedNames.join(' · '));
  } else if (ruleEval.relevantPresetIds.length === 0) {
    rationale += dict.rationaleParts.noKeywords;
  }
  rationale += lang === 'zh' ? '。' : '.';

  // Deterministically select a reflective question from First Principles / Socratic / Designing Your Life
  let framework: ReflectionFramework = 'dyl';
  let question = dict.prompts.go_default;

  if (verdict === 'go') {
    if (scores.career >= 70 || event.hiringCompanies.length > 0) {
      framework = 'socratic';
      question = dict.prompts.go_career;
    } else if (scores.learning >= 70) {
      framework = 'first_principles';
      question = dict.prompts.go_learning;
    } else {
      framework = 'dyl';
      question = dict.prompts.go_default;
    }
  } else if (verdict === 'edge') {
    if (time.totalHours >= 3) {
      framework = 'first_principles';
      question = dict.prompts.edge_time;
    } else if (scores.networking > scores.learning + 10) {
      framework = 'socratic';
      question = dict.prompts.edge_fomo;
    } else {
      framework = 'dyl';
      question = dict.prompts.edge_dyl;
    }
  } else {
    if (time.totalHours >= 2.5) {
      framework = 'first_principles';
      question = dict.prompts.not_go_opportunity;
    } else {
      framework = 'socratic';
      question = dict.prompts.not_go_signal;
    }
  }

  return {
    total,
    verdict,
    rationale,
    time,
    prompt: { framework, question },
  };
}

export function isEventEnded(event: Pick<EventEvalContext, 'startAt' | 'endAt'>, nowMs = Date.now()): boolean {
  if (event.endAt) {
    const end = new Date(event.endAt).getTime();
    if (Number.isFinite(end)) return end < nowMs;
  }
  const start = new Date(event.startAt).getTime();
  // Default assumed event duration of 2 hours if no endAt provided
  return Number.isFinite(start) ? start + 2 * 60 * 60 * 1000 < nowMs : false;
}

const ZH_TOPIC_RULES: { label: string; terms: string[] }[] = [
  { label: '具身智能与机器人', terms: ['embodied', 'physical ai', 'robotics', 'robot'] },
  { label: 'AI 智能体', terms: ['agentic', 'agent', 'agents', 'mcp', 'workflow'] },
  { label: 'AI 安全治理', terms: ['safety', 'cybersecurity', 'governance', 'alignment', 'ethics'] },
  { label: '开源大模型', terms: ['open weight', 'open source', 'open-source', 'deepseek', 'qwen', 'llama'] },
  { label: 'RAG 与检索评测', terms: ['rag', 'retrieval', 'vector', 'eval', 'database'] },
  { label: '算力与 GPU 基础设施', terms: ['gpu', 'compute', 'cloud', 'infra'] },
  { label: '金融与支付 AI', terms: ['payments', 'fintech', 'stablecoin', 'finance', 'stripe'] },
  { label: '企业级 AI 与商业', terms: ['enterprise', 'business impact', 'reliability', 'economics', 'saas'] },
  { label: '创业与融资出海', terms: ['fundraise', 'incorporate', 'startup', 'founders', 'going global', 'pitch'] },
  { label: '未来工作与职业', terms: ['future of work', 'career', 'hiring', 'talent'] },
  { label: '女性与 AI 社区', terms: ['women who ai', 'women in ai'] },
  { label: 'AI 工程与开发', terms: ['engineer', 'engineering', 'coding', 'builder', 'justbuild', 'shipmas', 'gemini'] },
];

const ZH_FORMAT_RULES: { label: string; terms: string[] }[] = [
  { label: '黑客松', terms: ['hackathon', 'buildathon'] },
  { label: '实战工作坊', terms: ['workshop', 'masterclass', 'clinic', 'hands-on', 'bootcamp'] },
  { label: '研究研讨会', terms: ['symposium', 'summit', 'conference', 'research'] },
  { label: '晨间徒步', terms: ['morning walk', 'walk'] },
  { label: '交流晚宴', terms: ['supper club', 'dinner', 'mixer', 'drinks'] },
  { label: '演示交流', terms: ['show & tell', 'demo', 'showcase', 'side quest', 'night'] },
  { label: '社区聚会', terms: ['meetup', 'communities', 'club'] },
];

/**
 * Deterministic Chinese topic/format summary for English event titles on /zh.
 * Keeps official original titles untouched while helping Chinese users scan faster.
 */
export function getZhEventSummary(event: Pick<EventEvalContext, 'title' | 'tags' | 'isOnline'>): string {
  // If the original title already contains Chinese characters, no extra summary needed.
  if (/[\u4e00-\u9fff]/.test(event.title)) return '';

  const text = normalizeText([event.title, ...event.tags].join(' '));
  const topics = ZH_TOPIC_RULES.filter((r) => hasAnyTerm(text, r.terms)).map((r) => r.label);
  const format = ZH_FORMAT_RULES.find((r) => hasAnyTerm(text, r.terms))?.label;

  const topicPart = topics.slice(0, 2).join(' · ') || 'AI 社区活动';
  const formatPart = format || (event.isOnline ? '线上分享' : '线下交流');
  return `${topicPart}｜${formatPart}`;
}

// ─── LocalStorage persistence (client-only, SSR-safe) ────────────────────────

const PREFS_KEY = 'sg_ai_oasis_gonogo_prefs_v1';
const DECISIONS_KEY = 'sg_ai_oasis_gonogo_decisions_v1';
const REFLECTIONS_KEY = 'sg_ai_oasis_gonogo_reflections_v1';
export const GONOGO_STORAGE_EVENT = 'sg-oasis-gonogo-updated';

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    window.dispatchEvent(new CustomEvent(GONOGO_STORAGE_EVENT));
  } catch {
    // Ignore storage quota or private-mode errors gracefully
  }
}

export function loadKeywordPrefs(): UserKeywordPrefs {
  const data = readJson<Partial<UserKeywordPrefs>>(PREFS_KEY, {});
  return {
    selectedIds: Array.isArray(data.selectedIds) ? data.selectedIds.filter((x): x is string => typeof x === 'string') : [],
    customKeywords: Array.isArray(data.customKeywords) ? data.customKeywords.filter((x): x is string => typeof x === 'string') : [],
  };
}

export function saveKeywordPrefs(prefs: UserKeywordPrefs): void {
  writeJson(PREFS_KEY, prefs);
}

export function loadAllDecisions(): Record<string, DecisionRecord> {
  return readJson<Record<string, DecisionRecord>>(DECISIONS_KEY, {});
}

export function loadDecision(eventId: string): DecisionRecord | null {
  return loadAllDecisions()[eventId] ?? null;
}

export function saveDecision(record: DecisionRecord): void {
  const all = loadAllDecisions();
  all[record.eventId] = record;
  writeJson(DECISIONS_KEY, all);
}

export function setEventAttended(eventId: string, eventTitle: string, attended: boolean): DecisionRecord {
  const existing = loadDecision(eventId);
  const updated: DecisionRecord = existing
    ? { ...existing, attended, updatedAt: new Date().toISOString() }
    : {
        eventId,
        eventTitle,
        scores: { learning: 50, networking: 50, career: 50 },
        total: 50,
        verdict: 'edge',
        finalChoice: attended ? 'go' : null,
        selectedKeywords: [],
        attended,
        updatedAt: new Date().toISOString(),
      };
  saveDecision(updated);
  return updated;
}

export function loadAllReflections(): Record<string, ReflectionRecord> {
  return readJson<Record<string, ReflectionRecord>>(REFLECTIONS_KEY, {});
}

export function loadReflection(eventId: string): ReflectionRecord | null {
  return loadAllReflections()[eventId] ?? null;
}

export function saveReflection(record: ReflectionRecord): void {
  const all = loadAllReflections();
  all[record.eventId] = record;
  writeJson(REFLECTIONS_KEY, all);
}
