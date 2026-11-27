export type Lang = 'zh' | 'en';

export interface SgEvent {
  id: string;
  title: string;            // original event name, never translated
  startAt: string;          // ISO 8601 (UTC)
  endAt?: string | null;
  venue: string;
  address: string;
  lat?: number | null;
  lng?: number | null;
  url: string;              // registration page
  coverImageUrl?: string | null;
  organiser: string;
  isFree: boolean | null;
  price?: string | null;
  status: 'open' | 'approval' | 'waitlist' | 'sold_out';
  isOnline: boolean;
  tags: string[];
  sourceIds: string[];
  companyIds: string[];     // companies in the watchlist linked to this event
  firstSeen: string;
  isFriendEvent?: boolean;  // manually imported friend/community event
  friendNote?: string;      // curator note or audience fit
  publishToSite?: boolean;  // whether to also show on public pages (map/events)
}

export interface FriendEvent extends SgEvent {
  isFriendEvent: true;
  friendNote?: string;
  publishToSite: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface EventSource {
  id: string;
  name: string;
  url: string;
  aiFilter: boolean;
  descEn: string;
  descZh: string;
}

export type JobFunction =
  | 'product' | 'design' | 'ai_ml' | 'data' | 'software' | 'infra'
  | 'solutions' | 'strategy' | 'gtm' | 'corporate' | 'other';
export type JobSeniority = 'intern' | 'junior' | 'mid' | 'senior' | 'lead';

export interface Company {
  id: string;
  name: string;
  sector: string;
  aiFocus: string;
  website?: string;
  careersUrl?: string;
}

export interface Job {
  id: string;
  companyId: string;
  title: string;            // original job title, never translated
  roleFamily: string;       // normalised title, e.g. "Product Manager"
  location: string;
  applyUrl: string;
  linkedinSearchUrl?: string;
  postedAt?: string | null;
  category: JobFunction;
  seniority: JobSeniority;
  isAiRelated: boolean;
  status: 'open' | 'closed';
  firstSeen: string;        // YYYY-MM-DD
  lastVerified: string;     // YYYY-MM-DD
}
