export type Mode = 'tv' | 'radio' | 'webcam';

export interface Stream {
  u: string; // URL, or `yt:<videoId>` for YouTube embeds
  q?: string; // quality / bitrate label
  h?: 1; // HLS audio
}

export interface Channel {
  id: string;
  n: string; // name
  c: string; // ISO country code
  g: string[]; // categories
  l: string | null; // logo / thumbnail
  la?: string[]; // languages
  w?: string | null; // website
  s: Stream[];
  o?: string; // owner (webcams)
  ci?: string | null; // city (webcams)
  p?: [number, number]; // lat/lng (webcams)
  t?: string[]; // tags (radio)
}

export interface Category {
  id: string;
  name: string;
}

export interface Dataset {
  updated: string;
  categories: Category[];
  countries?: Record<string, { n: string; f: string }>;
  channels: Channel[];
}

export interface CountryMeta {
  n: string;
  f: string;
  p: [number, number];
  a: number;
  r: string;
  i: string | null;
  cap: string | null;
  tz: string | null;
}

export interface ChannelRef {
  mode: Mode;
  id: string;
}

export type SidebarTab = 'countries' | 'categories' | 'favorites' | 'recent';
export type PlayerSize = 'docked' | 'theater' | 'mini';
