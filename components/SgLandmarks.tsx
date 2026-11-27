'use client';

import type { ReactNode } from 'react';

export interface SgLandmark {
  id: string;
  label: string;
  lat: number;
  lng: number;
  labelPos?: 'bottom' | 'top';
  labelNudgeX?: number; // subtle label-only horizontal alignment (icon stays at exact GPS)
  icon: ReactNode;
}

export interface MapMrtStation {
  id: string;
  name: string;
  code: string;
  lineColor: string;
  lat: number;
  lng: number;
  priority: number; // lower number = kept first when labels are close at low zoom
}

const STROKE = '#18181b';

/**
 * Six compact, delicate hand-drawn single-stroke architectural silhouettes
 * anchored directly to their true Singapore GPS coordinates (zero artificial drift).
 */
export const SG_LANDMARKS: SgLandmark[] = [
  {
    id: 'ntu',
    label: 'NTU',
    lat: 1.3483,
    lng: 103.6831,
    // The Hive (Dim Sum Basket Learning Hub)
    icon: (
      <svg width="24" height="19" viewBox="0 0 36 30" fill="none" aria-hidden="true">
        <path
          d="M5 26H31M7.5 26L6.2 14.5C6.1 12.2 8.4 11 11.2 11C14 11 15.8 12.2 15.6 14.5L14.5 26"
          stroke={STROKE} strokeWidth="1.45" strokeLinecap="round" strokeLinejoin="round"
        />
        <path
          d="M14.2 26L13.3 9.5C13.2 7.2 15.6 5.8 18.6 5.8C21.6 5.8 23.8 7.2 23.6 9.5L22.5 26"
          stroke={STROKE} strokeWidth="1.45" strokeLinecap="round" strokeLinejoin="round"
        />
        <path
          d="M22.2 26L21.5 13.8C21.4 11.7 23.6 10.6 26.2 10.6C28.8 10.6 30.6 11.8 30.4 13.8L29.2 26"
          stroke={STROKE} strokeWidth="1.45" strokeLinecap="round" strokeLinejoin="round"
        />
        <path
          d="M6.8 17.5C9.5 18.3 12.5 18.3 15 17.5M13.8 12.2C16.8 13.1 20.1 13.1 23.2 12.2M14 17.5C16.8 18.3 20 18.3 22.9 17.5M22 17.2C24.5 18 27.3 18 29.8 17.2"
          stroke={STROKE} strokeWidth="1.15" strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    id: 'one-north',
    label: 'one-north',
    lat: 1.2998,
    lng: 103.7871,
    labelPos: 'top',
    // Fusionopolis cantilevered terraced tech hub (exact one-north MRT coord)
    icon: (
      <svg width="24" height="19" viewBox="0 0 38 30" fill="none" aria-hidden="true">
        <path
          d="M4 26H34M8 26V10L16 6V26M16 14H24M24 26V8L31 11V26"
          stroke={STROKE} strokeWidth="1.45" strokeLinecap="round" strokeLinejoin="round"
        />
        <path
          d="M16 18.5H24M10.5 13H13.5M10.5 18H13.5M26.5 14H29M26.5 19H29"
          stroke={STROKE} strokeWidth="1.15" strokeLinecap="round"
        />
        <path d="M12 8L18 4.2L22 6" stroke={STROKE} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: 'orchard',
    label: 'Orchard',
    lat: 1.3040,
    lng: 103.8318,
    // ION Orchard sweeping curved canopy + spire (exact Orchard MRT coord)
    icon: (
      <svg width="24" height="19" viewBox="0 0 38 30" fill="none" aria-hidden="true">
        <path
          d="M4 26H34M7 26C7 19 11 14 19 14C27 14 31 19 31 26"
          stroke={STROKE} strokeWidth="1.45" strokeLinecap="round" strokeLinejoin="round"
        />
        <path
          d="M11 26C12 20.5 14.8 17.5 19 17.5C23.2 17.5 26 20.5 27 26M19 5V3"
          stroke={STROKE} strokeWidth="1.15" strokeLinecap="round"
        />
        <path
          d="M14 14.5V7.5L19 5L24 7.5V14.5"
          stroke={STROKE} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    id: 'national-library',
    label: 'National Library',
    lat: 1.2975,
    lng: 103.8543,
    // National Library Victoria St twin blocks & skybridges (exact building coord)
    icon: (
      <svg width="23" height="19" viewBox="0 0 36 30" fill="none" aria-hidden="true">
        <path
          d="M4 26H32M8 26V7H16.5V26M21.5 26V9.5H29V26"
          stroke={STROKE} strokeWidth="1.45" strokeLinecap="round" strokeLinejoin="round"
        />
        <path d="M16.5 13H21.5M16.5 19H21.5" stroke={STROKE} strokeWidth="1.35" strokeLinecap="round" />
        <path
          d="M10.2 11.5H14.3M10.2 16.5H14.3M10.2 21H14.3M23.5 14H27M23.5 19H27"
          stroke={STROKE} strokeWidth="1.1" strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    id: 'chinatown',
    label: 'Chinatown',
    lat: 1.2836,
    lng: 103.8444,
    labelNudgeX: -14,
    // Heritage Chinatown Tang-style tiered eaves & shophouse arches (exact Chinatown MRT coord)
    icon: (
      <svg width="24" height="19" viewBox="0 0 38 30" fill="none" aria-hidden="true">
        <path d="M4 26H34M9 26V16.5M29 26V16.5" stroke={STROKE} strokeWidth="1.45" strokeLinecap="round" />
        <path
          d="M6.5 16.8C10.5 16.5 13.5 15 19 14.5C24.5 15 27.5 16.5 31.5 16.8"
          stroke={STROKE} strokeWidth="1.45" strokeLinecap="round" strokeLinejoin="round"
        />
        <path
          d="M12.5 15V11M25.5 15V11M10 11.4C13.5 11 16 9 19 6.5C22 9 24.5 11 28 11.4"
          stroke={STROKE} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"
        />
        <path
          d="M13 26V21.5C13 20 14.1 19 15.5 19C16.9 19 18 20 18 21.5V26M20 26V21.5C20 20 21.1 19 22.5 19C23.9 19 25 20 25 21.5V26"
          stroke={STROKE} strokeWidth="1.15" strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    id: 'marina-bay',
    label: 'Marina Bay',
    lat: 1.2834,
    lng: 103.8607,
    labelNudgeX: 12,
    // Marina Bay Sands SkyPark + ArtScience Lotus (exact Bayfront/MBS coord)
    icon: (
      <svg width="28" height="19" viewBox="0 0 44 30" fill="none" aria-hidden="true">
        <path d="M3 26H41" stroke={STROKE} strokeWidth="1.35" strokeLinecap="round" />
        <path
          d="M8 26L9.5 11.5M12.5 26L11.8 11.5M16 26L17.3 11.5M20.5 26L19.8 11.5M24 26L25.2 11.5M28.5 26L27.8 11.5"
          stroke={STROKE} strokeWidth="1.4" strokeLinecap="round"
        />
        <path
          d="M6 10.5C12 11.6 24 11.6 32.5 9.2L34 11C25 13 13 13 6.5 12Z"
          stroke={STROKE} strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round"
        />
        <path
          d="M34 26L32.8 20.5L35.8 23.2L37 19L38.2 23.2L41.2 20.5L40 26"
          stroke={STROKE} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"
        />
      </svg>
    ),
  },
];

/**
 * Major Singapore MRT stations rendered as quiet, true-position spatial anchors.
 * Collision-culled in screen space so higher-priority hubs stay crisp at island zoom
 * and denser CBD stations appear smoothly as the user zooms in.
 */
export const MAP_MRT_STATIONS: MapMrtStation[] = [
  // West & South-West
  { id: 'jurong-east',     name: 'Jurong East',     code: 'EW24', lineColor: '#009645', lat: 1.3332, lng: 103.7422, priority: 1 },
  { id: 'buona-vista',     name: 'Buona Vista',     code: 'EW21', lineColor: '#009645', lat: 1.3073, lng: 103.7906, priority: 3 },
  { id: 'kent-ridge',      name: 'Kent Ridge',      code: 'CC24', lineColor: '#FA9E0D', lat: 1.2934, lng: 103.7847, priority: 5 },
  { id: 'labrador-park',   name: 'Labrador Park',   code: 'CC27', lineColor: '#FA9E0D', lat: 1.2722, lng: 103.8029, priority: 1 },
  { id: 'harbourfront',    name: 'HarbourFront',    code: 'NE1',  lineColor: '#9900AA', lat: 1.2655, lng: 103.8217, priority: 2 },
  // Central-North & North
  { id: 'bishan',          name: 'Bishan',          code: 'NS17', lineColor: '#D42E12', lat: 1.3506, lng: 103.8481, priority: 1 },
  { id: 'ang-mo-kio',      name: 'Ang Mo Kio',      code: 'NS16', lineColor: '#D42E12', lat: 1.3699, lng: 103.8496, priority: 3 },
  { id: 'novena',          name: 'Novena',          code: 'NS20', lineColor: '#D42E12', lat: 1.3202, lng: 103.8436, priority: 2 },
  { id: 'botanic-gardens', name: 'Botanic Gardens', code: 'CC19', lineColor: '#FA9E0D', lat: 1.3226, lng: 103.8153, priority: 2 },
  // Central & CBD
  { id: 'dhoby-ghaut',     name: 'Dhoby Ghaut',     code: 'NS24', lineColor: '#D42E12', lat: 1.2996, lng: 103.8456, priority: 5 },
  { id: 'bugis',           name: 'Bugis',           code: 'EW12', lineColor: '#009645', lat: 1.3009, lng: 103.8559, priority: 4 },
  { id: 'city-hall',       name: 'City Hall',       code: 'EW13', lineColor: '#009645', lat: 1.2930, lng: 103.8520, priority: 4 },
  { id: 'clarke-quay',     name: 'Clarke Quay',     code: 'NE5',  lineColor: '#9900AA', lat: 1.2884, lng: 103.8465, priority: 3 },
  { id: 'raffles-place',   name: 'Raffles Place',   code: 'EW14', lineColor: '#009645', lat: 1.2837, lng: 103.8513, priority: 4 },
  { id: 'tanjong-pagar',   name: 'Tanjong Pagar',   code: 'EW15', lineColor: '#009645', lat: 1.2766, lng: 103.8456, priority: 3 },
  { id: 'downtown',        name: 'Downtown',        code: 'DT17', lineColor: '#005EC4', lat: 1.2793, lng: 103.8527, priority: 5 },
  // East
  { id: 'serangoon',       name: 'Serangoon',       code: 'NE12', lineColor: '#9900AA', lat: 1.3497, lng: 103.8731, priority: 2 },
  { id: 'paya-lebar',      name: 'Paya Lebar',      code: 'EW8',  lineColor: '#009645', lat: 1.3178, lng: 103.8920, priority: 1 },
  { id: 'marine-parade',   name: 'Marine Parade',   code: 'TE27', lineColor: '#9D5B25', lat: 1.3026, lng: 103.9070, priority: 1 },
  { id: 'tampines',        name: 'Tampines',        code: 'EW2',  lineColor: '#009645', lat: 1.3529, lng: 103.9454, priority: 1 },
];
