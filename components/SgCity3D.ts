/**
 * Lightweight 3D architectural district massing for Singapore's key AI & tech hubs.
 * Renders crisp monochrome 3D extrusions even at island-wide zoom (z 10.5-13),
 * seamlessly blending into OpenFreeMap's street-level 3D buildings when zoomed in.
 */

interface BlockSpec {
  lng: number;
  lat: number;
  w: number;      // half-width in deg lng (~0.001 = 110m)
  d: number;      // half-depth in deg lat
  height: number; // meters (slightly stylized for game-like isometric skyline presence)
  accent?: boolean;
}

const CITY_BLOCKS: BlockSpec[] = [
  // Marina Bay Sands (3 iconic stepped towers) + Financial Centre
  { lng: 103.8592, lat: 1.2830, w: 0.00055, d: 0.0007, height: 340, accent: true },
  { lng: 103.8603, lat: 1.2836, w: 0.00055, d: 0.0007, height: 340, accent: true },
  { lng: 103.8614, lat: 1.2842, w: 0.00055, d: 0.0007, height: 340, accent: true },
  // CBD / Raffles Place / Marina Bay Financial Centre / Asia Square (The Westin)
  { lng: 103.8508, lat: 1.2783, w: 0.00075, d: 0.00075, height: 310, accent: true },
  { lng: 103.8527, lat: 1.2795, w: 0.0008, d: 0.0007, height: 360 },
  { lng: 103.8542, lat: 1.2804, w: 0.0007, d: 0.0007, height: 280 },
  { lng: 103.8513, lat: 1.2840, w: 0.0008, d: 0.0008, height: 390 },
  { lng: 103.8495, lat: 1.2832, w: 0.0007, d: 0.0007, height: 320 },
  { lng: 103.8482, lat: 1.2815, w: 0.00065, d: 0.00065, height: 240 },
  { lng: 103.8456, lat: 1.2764, w: 0.0008, d: 0.0007, height: 330 },
  // Clarke Quay / SGInnovate / City Hall / National Library
  { lng: 103.8473, lat: 1.2886, w: 0.0007, d: 0.0006, height: 185, accent: true },
  { lng: 103.8520, lat: 1.2930, w: 0.0008, d: 0.0007, height: 240 },
  { lng: 103.8543, lat: 1.2975, w: 0.0007, d: 0.0007, height: 210 },
  { lng: 103.8565, lat: 1.3005, w: 0.00075, d: 0.0007, height: 225 },
  { lng: 103.8588, lat: 1.2940, w: 0.0009, d: 0.0008, height: 250 },
  // Orchard / Somerset
  { lng: 103.8318, lat: 1.3040, w: 0.0008, d: 0.00075, height: 260 },
  { lng: 103.8345, lat: 1.3025, w: 0.0007, d: 0.00065, height: 210 },
  { lng: 103.8388, lat: 1.3002, w: 0.0007, d: 0.00065, height: 195 },
  // one-north / Fusionopolis / Biopolis / Lorong AI / LaunchPad
  { lng: 103.7871, lat: 1.2995, w: 0.0009, d: 0.00075, height: 230, accent: true },
  { lng: 103.7892, lat: 1.3012, w: 0.00075, d: 0.0007, height: 185 },
  { lng: 103.7869, lat: 1.2961, w: 0.00085, d: 0.0007, height: 195, accent: true },
  { lng: 103.7906, lat: 1.3065, w: 0.0008, d: 0.0007, height: 220 },
  // Pasir Panjang / Mapletree Business City / Google Developers Space / HarbourFront
  { lng: 103.7995, lat: 1.2762, w: 0.001, d: 0.0008, height: 215, accent: true },
  { lng: 103.8022, lat: 1.2748, w: 0.0008, d: 0.0007, height: 175 },
  { lng: 103.8217, lat: 1.2655, w: 0.00095, d: 0.00075, height: 190 },
  // Jurong East / NTU
  { lng: 103.7422, lat: 1.3332, w: 0.0009, d: 0.0008, height: 220 },
  { lng: 103.7448, lat: 1.3345, w: 0.00075, d: 0.0007, height: 180 },
  { lng: 103.6831, lat: 1.3483, w: 0.0009, d: 0.0008, height: 155 },
  // Paya Lebar Quarter / Marine Parade / Tampines / Bishan
  { lng: 103.8920, lat: 1.3178, w: 0.00085, d: 0.00075, height: 205 },
  { lng: 103.9128, lat: 1.3017, w: 0.00075, d: 0.00065, height: 140, accent: true },
  { lng: 103.9454, lat: 1.3529, w: 0.0009, d: 0.00075, height: 165 },
  { lng: 103.8481, lat: 1.3506, w: 0.0008, d: 0.0007, height: 170 },
];

export function buildSgCity3DGeoJson() {
  return {
    type: 'FeatureCollection' as const,
    features: CITY_BLOCKS.map((b, i) => ({
      type: 'Feature' as const,
      id: i,
      properties: {
        height: b.height,
        accent: b.accent ? 1 : 0,
      },
      geometry: {
        type: 'Polygon' as const,
        coordinates: [[
          [b.lng - b.w, b.lat - b.d],
          [b.lng + b.w, b.lat - b.d],
          [b.lng + b.w, b.lat + b.d],
          [b.lng - b.w, b.lat + b.d],
          [b.lng - b.w, b.lat - b.d],
        ]],
      },
    })),
  };
}
