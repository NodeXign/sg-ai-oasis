'use client';

import type { SgEvent } from '@/lib/types';
import EventMap from './EventMap';

interface Props {
  events: SgEvent[];
}

export default function MapPanel({ events }: Props) {
  return <EventMap events={events} />;
}
