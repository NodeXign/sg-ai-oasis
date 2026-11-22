export type Platform = 'luma' | 'eventbrite';
export type Level = 'beginner' | 'practitioner' | 'builder';
export type EventStatus = 'open' | 'full' | 'closed' | 'approval' | 'fast' | 'urgent';

export interface MrtStation {
  name: string;
  code: string;
  line: string;
  lineColor: string;
  lat: number;
  lng: number;
  walkMins?: number;
}

export interface Organizer {
  id: string;
  name: string;
  lumaHandle?: string;
  website?: string;
  description: string;
  score: number;        // 1–5
  scoreNote: string;
  tags: string[];
  logoUrl?: string;
  type: 'tech_company' | 'community' | 'academic' | 'individual' | 'startup';
}

export interface SgEvent {
  id: string;
  title: string;
  description?: string;
  startAt: string;       // ISO 8601
  endAt?: string;
  venue: string;
  venueLat?: number;
  venueLng?: number;
  mrtStations?: MrtStation[];  // pre-computed nearest stations
  platform: Platform;
  sourceUrl: string;
  isFree: boolean;
  price?: string;
  coverImageUrl?: string;
  externalId?: string;
  attendeeCount?: number;
  status?: EventStatus;
  tags: string[];
  levels: Level[];
  score: number;         // 1–5 curator score
  scoreNote?: string;
  isCuratorPick: boolean;
  isNew: boolean;
  organizers: Organizer[];
  // ── Enrichment fields ──────────────────────────
  oneLiner?: string;        // One-sentence intro for search / preview
  targetAudience?: string;  // Who should attend
  findPartner?: string;     // What kind of people to network with there
  eventType?: string;       // Standardised format label
  expectedTakeaway?: string;
  curatorTake?: string;
  notIdealFor?: string;
  opportunityPath?: string;
  careerSignal?: string;
  // ──────────────────────────────────────────────
  scrapedAt: string;
  createdAt: string;
}

export interface EventStats {
  total: number;
  free: number;
  topAttendance: number;
  busiestDay: string;
  newCount: number;
}

export interface DistributionByDay {
  date: string;
  label: string;
  count: number;
}

export interface DistributionByLevel {
  level: string;
  count: number;
  fill: string;
}

// ── Companies × Jobs ─────────────────────────────
export type JobCategory = 'product' | 'solutions' | 'strategy' | 'data' | 'engineering' | 'gtm' | 'other';
export type JobSeniority = 'intern' | 'junior' | 'mid' | 'senior' | 'lead';

export interface Company {
  id: string;
  name: string;
  sector: string;
  aiFocus: string;
  website?: string;
  careersUrl?: string;
  organizerIds: string[];   // links a company to event organizers
}

export interface Job {
  id: string;
  companyId: string;
  title: string;
  location: string;
  department: string;
  applyUrl: string;
  linkedinSearchUrl?: string;
  postedAt?: string | null;
  category: JobCategory;
  seniority: JobSeniority;
  isAiRelated: boolean;
  verification: 'dual' | 'official' | 'pending' | 'unknown';
  status: 'open' | 'closed';
  firstSeen: string;        // YYYY-MM-DD
  lastVerified: string;     // YYYY-MM-DD
}
