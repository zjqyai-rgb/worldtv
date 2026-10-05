// Builds public/data/countries.json: per-country metadata used by the globe and panels.
import { createRequire } from 'node:module';
import ct from 'countries-and-timezones';
import { writeJson } from './lib.mjs';

const countries = createRequire(import.meta.url)('world-countries');

// Pick the timezone of the capital where it's easy to tell; otherwise the most common zone.
const TZ_OVERRIDE = {
  US: 'America/New_York', CA: 'America/Toronto', RU: 'Europe/Moscow', AU: 'Australia/Sydney', BR: 'America/Sao_Paulo',
  MX: 'America/Mexico_City', ID: 'Asia/Jakarta', CN: 'Asia/Shanghai', KZ: 'Asia/Almaty', AR: 'America/Argentina/Buenos_Aires',
  CL: 'America/Santiago', ES: 'Europe/Madrid', PT: 'Europe/Lisbon', EC: 'America/Guayaquil', CD: 'Africa/Kinshasa',
  MN: 'Asia/Ulaanbaatar', UA: 'Europe/Kyiv', DE: 'Europe/Berlin', GB: 'Europe/London', NZ: 'Pacific/Auckland',
  FR: 'Europe/Paris', NL: 'Europe/Amsterdam', DK: 'Europe/Copenhagen', UZ: 'Asia/Tashkent', MY: 'Asia/Kuala_Lumpur',
  PG: 'Pacific/Port_Moresby', KI: 'Pacific/Tarawa', FM: 'Pacific/Pohnpei', PF: 'Pacific/Tahiti', CY: 'Asia/Nicosia',
};

const out = {};
for (const c of countries) {
  const tzs = ct.getCountry(c.cca2)?.timezones || [];
  out[c.cca2] = {
    n: c.name.common,
    f: c.flag,
    p: c.latlng,
    a: c.area,
    r: c.region,
    i: c.ccn3 || null,
    cap: c.capital?.[0] || null,
    tz: TZ_OVERRIDE[c.cca2] || tzs[0] || null,
  };
}
out.XK = { ...out.XK, i: out.XK?.i || '-99' };
out.XS = { n: 'Space', f: '🛰️', p: [0, 0], a: 0, r: 'Space', i: null, cap: 'Low Earth Orbit', tz: 'UTC' };
await writeJson('countries.json', out);
