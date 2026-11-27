import type { SgEvent } from './types';
import { getNearestMrt } from './mrt-stations';

export type LocationPrecision = 'exact' | 'area';

export interface ResolvedEventGeo {
  lat: number;
  lng: number;
  precision: LocationPrecision;
  areaLabel?: string;
  mrtName?: string;
  mrtCode?: string;
  mrtWalkMins?: number;
}

// Well-known Singapore tech/AI venues that sometimes publish an address without lat/lng
// (e.g. Bevy / SGInnovate feeds). All entries represent confirmed exact street addresses.
const KNOWN_EXACT_VENUES: { match: RegExp; lat: number; lng: number }[] = [
  { match: /80\s+pasir\s+panjang|google\s+developers?\s+space/i, lat: 1.2762, lng: 103.7995 },
  { match: /32\s+carpenter\s+st/i, lat: 1.2886, lng: 103.8473 },
  { match: /88\s+market\s+st|capitaspring/i, lat: 1.2840, lng: 103.8501 },
  { match: /69\s+ayer\s+rajah|lorong\s+ai/i, lat: 1.2961, lng: 103.7870 },
  { match: /71\s+ayer\s+rajah|block\s*71|b71/i, lat: 1.2966, lng: 103.7867 },
  { match: /79\s+ayer\s+rajah|launch\s*pad/i, lat: 1.2974, lng: 103.7872 },
  { match: /100\s+victoria\s+st|national\s+library/i, lat: 1.2975, lng: 103.8543 },
  { match: /suntec\s+(city|singapore|convention)/i, lat: 1.2935, lng: 103.8572 },
  { match: /marina\s+bay\s+sands|10\s+bayfront/i, lat: 1.2834, lng: 103.8607 },
  { match: /lifelong\s+learning\s+institute|11\s+eunos\s+rd/i, lat: 1.3195, lng: 103.8924 },
];

// Broad districts/areas when an organiser shares only an area without an exact street address.
const KNOWN_AREAS: { match: RegExp; label: string; lat: number; lng: number }[] = [
  { match: /\bone[-\s]?north\b/i, label: 'one-north', lat: 1.2998, lng: 103.7871 },
  { match: /\bntu\b|nanyang\s+technological/i, label: 'NTU', lat: 1.3483, lng: 103.6831 },
  { match: /\bnus\b|kent\s+ridge/i, label: 'Kent Ridge', lat: 1.2966, lng: 103.7764 },
  { match: /\bmarina\s+bay\b/i, label: 'Marina Bay', lat: 1.2815, lng: 103.8585 },
  { match: /\borchard\b/i, label: 'Orchard', lat: 1.3040, lng: 103.8318 },
  { match: /\bchinatown\b/i, label: 'Chinatown', lat: 1.2836, lng: 103.8444 },
  { match: /\bbugis\b|bras\s+basah/i, label: 'Bugis', lat: 1.3009, lng: 103.8559 },
  { match: /\btanjong\s+pagar\b/i, label: 'Tanjong Pagar', lat: 1.2766, lng: 103.8456 },
  { match: /\braffles\s+place\b|\bcbd\b/i, label: 'Raffles Place', lat: 1.2837, lng: 103.8513 },
  { match: /\bclarke\s+quay\b/i, label: 'Clarke Quay', lat: 1.2884, lng: 103.8465 },
  { match: /\bcity\s+hall\b/i, label: 'City Hall', lat: 1.2930, lng: 103.8520 },
  { match: /\bpaya\s+lebar\b/i, label: 'Paya Lebar', lat: 1.3178, lng: 103.8920 },
  { match: /\bharbourfront\b/i, label: 'HarbourFront', lat: 1.2655, lng: 103.8217 },
  { match: /\bbuona\s+vista\b/i, label: 'Buona Vista', lat: 1.3073, lng: 103.7906 },
  { match: /\bpasir\s+panjang\b/i, label: 'Pasir Panjang', lat: 1.2762, lng: 103.7914 },
];

const HAS_STREET_OR_POSTAL = /\b\d{6}\b|\b\d+\s+[A-Za-z]|level\s*\d|#\d|tower|building|hub|centre|center|space|hotel|collective|mcdonald|lounge/i;

function attachNearestMrt(
  lat: number,
  lng: number,
  precision: LocationPrecision,
  areaLabel?: string,
): ResolvedEventGeo {
  const nearest = getNearestMrt(lat, lng, 1)[0];
  const withinWalk = nearest && nearest.walkMins <= 20;
  return {
    lat,
    lng,
    precision,
    areaLabel,
    mrtName: withinWalk ? nearest.name : undefined,
    mrtCode: withinWalk ? nearest.code : undefined,
    mrtWalkMins: withinWalk ? Math.max(nearest.walkMins, 1) : undefined,
  };
}

/**
 * Resolves map coordinates & precision for an event using strictly deterministic rules.
 * Events with hidden addresses (empty venue & address) or online-only events return null
 * and are kept off the map per project convention.
 */
export function resolveEventGeo(event: SgEvent): ResolvedEventGeo | null {
  if (event.isOnline) return null;

  const combined = `${event.venue} ${event.address}`.trim();

  // Case 1: Event already has explicit coordinates from source feed.
  if (event.lat != null && event.lng != null) {
    const isExact = HAS_STREET_OR_POSTAL.test(combined) || event.address.split(',').length >= 2;
    const matchedArea = KNOWN_AREAS.find((a) => a.match.test(combined));
    return attachNearestMrt(
      event.lat,
      event.lng,
      isExact ? 'exact' : 'area',
      matchedArea?.label,
    );
  }

  // Case 2: No venue/address published (organiser hid the location) -> keep off map.
  if (!combined) return null;

  // Case 3: Published exact street address at a known Singapore venue.
  const knownVenue = KNOWN_EXACT_VENUES.find((v) => v.match.test(combined));
  if (knownVenue) {
    return attachNearestMrt(knownVenue.lat, knownVenue.lng, 'exact');
  }

  // Case 4: Published area/district name only (exact address TBA -> dashed card border).
  const knownArea = KNOWN_AREAS.find((a) => a.match.test(combined));
  if (knownArea) {
    return attachNearestMrt(knownArea.lat, knownArea.lng, 'area', knownArea.label);
  }

  return null;
}
