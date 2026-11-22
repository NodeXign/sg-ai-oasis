import type { SgEvent } from './types';

function text(event: SgEvent) {
  return [event.title, event.description, event.oneLiner, event.scoreNote, event.tags.join(' ')]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function includes(event: SgEvent, terms: string[]) {
  const haystack = text(event);
  return terms.some((term) => haystack.includes(term.toLowerCase()));
}

export function getEventType(event: SgEvent) {
  if (event.eventType) return event.eventType;
  if (includes(event, ['hackathon'])) return 'Hackathon';
  if (includes(event, ['salon', 'founder', 'vc'])) return 'Founder / VC Salon';
  if (includes(event, ['workshop', 'hands-on', 'bootcamp'])) return 'Hands-on Workshop';
  if (includes(event, ['language', 'data', 'model', 'redis', 'recommender'])) return 'Technical Talk';
  if (includes(event, ['film', 'vfx', 'creative'])) return 'Creative AI Lab';
  return 'Community Meetup';
}

export function getHubLabel(event: SgEvent) {
  const venue = event.venue.toLowerCase();
  if (venue.includes('one-north') || venue.includes('lorong ai')) return 'one-north AI & Startup Hub';
  if (venue.includes('cross street') || venue.includes('raffles') || venue.includes('downtown')) return 'CBD / FinTech Hub';
  if (venue.includes('queenstown')) return 'Startup & Community Hub';
  if (venue.includes('suntec') || venue.includes('marina')) return 'Marina Bay Conference Cluster';
  return 'Singapore-wide';
}

export function getBestFor(event: SgEvent) {
  return event.targetAudience || 'People choosing which Singapore AI event is worth their time';
}

export function getExpectedTakeaway(event: SgEvent) {
  if (event.expectedTakeaway) return event.expectedTakeaway;
  if (includes(event, ['hackathon'])) return 'A project brief, team signal and portfolio-ready build direction.';
  if (includes(event, ['salon', 'founder', 'vc'])) return 'A sharper read on founder, investor and market signals.';
  if (includes(event, ['language', 'data'])) return 'Why local data quality matters for AI products in Southeast Asia.';
  return event.oneLiner || 'A clearer decision on whether this topic is worth your time.';
}

export function getCuratorTake(event: SgEvent) {
  if (event.curatorTake) return event.curatorTake;
  if (event.isCuratorPick || event.score >= 4) return 'Worth going if the topic matches your next skill, project or network goal.';
  return 'Good if relevant. Treat it as discovery, not a must-attend signal.';
}

export function getNotIdealFor(event: SgEvent) {
  if (event.notIdealFor) return event.notIdealFor;
  if (includes(event, ['hackathon'])) return 'people who only want passive listening';
  if (includes(event, ['model', 'redis', 'recommender', 'data'])) return 'complete beginners who want a no-code overview';
  return 'people who need a guaranteed recruiting event';
}

export function getOpportunityPath(event: SgEvent) {
  if (event.opportunityPath) return event.opportunityPath;
  if (includes(event, ['hackathon'])) return 'Event -> team/project -> demo -> GitHub or LinkedIn portfolio.';
  if (includes(event, ['salon', 'founder', 'vc'])) return 'Event -> founder/investor conversations -> market thesis -> follow-up coffee.';
  return 'Event -> one useful contact -> one takeaway post -> one next action.';
}

export function buildCareerSignals(events: SgEvent[]) {
  return [
    { value: events.filter((event) => includes(event, ['agent', 'context', 'workflow'])).length, label: 'Agent / context signals' },
    { value: events.filter((event) => event.levels.includes('builder')).length, label: 'Builder-friendly events' },
    { value: events.filter((event) => event.levels.includes('beginner')).length, label: 'Beginner entry points' },
    { value: events.filter((event) => includes(event, ['hackathon', 'founder', 'portfolio'])).length, label: 'Career / portfolio openings' },
  ];
}

export function getTopPicks(events: SgEvent[], limit = 4) {
  return [...events]
    .sort((a, b) => Number(b.isCuratorPick) - Number(a.isCuratorPick) || b.score - a.score)
    .slice(0, limit);
}
