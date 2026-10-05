import { useEffect, useMemo, useRef, useState } from 'react';
import Globe, { type GlobeMethods } from 'react-globe.gl';
import * as THREE from 'three';
import { feature } from 'topojson-client';
import type { Feature, Geometry } from 'geojson';
import { useChannels, useStore } from '../store';
import { countBy, MODE_LABEL } from '../lib';
import type { Channel } from '../types';

type CountryFeature = Feature<Geometry, { name: string }> & { cc?: string };

// Heat palette: sparse -> dense.
const STOPS = ['#1e3a8a', '#0891b2', '#22d3ee', '#a78bfa', '#f472b6', '#fbbf24'];
function heat(t: number, alpha: number) {
  const x = Math.min(0.999, Math.max(0, t)) * (STOPS.length - 1);
  const i = Math.floor(x);
  const f = x - i;
  const a = new THREE.Color(STOPS[i]);
  const b = new THREE.Color(STOPS[i + 1]);
  a.lerp(b, f);
  return `rgba(${Math.round(a.r * 255)},${Math.round(a.g * 255)},${Math.round(a.b * 255)},${alpha})`;
}

const CAT_COLOR: Record<string, string> = {
  city: '#22d3ee',
  beach: '#38bdf8',
  nature: '#4ade80',
  wildlife: '#fbbf24',
  transport: '#f472b6',
  space: '#a78bfa',
};

export default function WorldGlobe() {
  const globeRef = useRef<GlobeMethods | undefined>(undefined);
  const [size, setSize] = useState(globeSize);
  const [features, setFeatures] = useState<CountryFeature[]>([]);
  const [hover, setHover] = useState<CountryFeature | null>(null);
  const mode = useStore((s) => s.mode);
  const countries = useStore((s) => s.countries);
  const country = useStore((s) => s.country);
  const playing = useStore((s) => s.playing);
  const selectCountry = useStore((s) => s.selectCountry);
  const play = useStore((s) => s.play);
  const channels = useChannels();
  const idleTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const on = () => setSize(globeSize());
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);

  // Country shapes, tagged with ISO alpha-2 codes.
  useEffect(() => {
    if (!Object.keys(countries).length) return;
    const byNum = new Map<string, string>();
    for (const [cc, m] of Object.entries(countries)) if (m.i) byNum.set(String(Number(m.i)), cc);
    fetch('/data/countries-50m.json')
      .then((r) => r.json())
      .then((topo) => {
        const fc = feature(topo, topo.objects.countries) as unknown as { features: CountryFeature[] };
        const list = fc.features
          .filter((f) => f.id !== '010') // Antarctica
          .map((f) => {
            let cc = byNum.get(String(Number(f.id)));
            if (!cc && f.properties.name === 'Kosovo') cc = 'XK';
            if (!cc && f.properties.name === 'N. Cyprus') cc = 'CY';
            if (!cc && f.properties.name === 'Somaliland') cc = 'SO';
            return Object.assign(f, { cc });
          });
        setFeatures(list);
      });
  }, [countries]);

  const counts = useMemo(() => countBy(channels, (c) => c.c), [channels]);
  const maxLog = useMemo(() => Math.log1p(Math.max(1, ...counts.values())), [counts]);

  // Setup: controls, lighting, drifting cloud layer.
  useEffect(() => {
    const g = globeRef.current;
    if (!g) return;
    const controls = g.controls();
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.35;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 140;
    controls.maxDistance = 700;
    g.pointOfView({ lat: 22, lng: 10, altitude: window.innerWidth < 820 ? 3.2 : 2.3 }, 0);

    const stopRotate = () => {
      controls.autoRotate = false;
      window.clearTimeout(idleTimer.current);
      idleTimer.current = window.setTimeout(() => (controls.autoRotate = !useStore.getState().country), 25000);
    };
    controls.addEventListener('start', stopRotate);

    const scene = g.scene();
    const globeRadius = g.getGlobeRadius();
    let clouds: THREE.Mesh | null = null;
    new THREE.TextureLoader().load('/textures/clouds.png', (tex) => {
      clouds = new THREE.Mesh(
        new THREE.SphereGeometry(globeRadius * 1.006, 75, 75),
        new THREE.MeshPhongMaterial({ map: tex, transparent: true, opacity: 0.28, depthWrite: false }),
      );
      scene.add(clouds);
    });
    let raf = 0;
    const spin = () => {
      if (clouds) clouds.rotation.y += 0.00012;
      raf = requestAnimationFrame(spin);
    };
    spin();
    return () => {
      cancelAnimationFrame(raf);
      controls.removeEventListener('start', stopRotate);
      if (clouds) scene.remove(clouds);
    };
  }, []);

  // Fly to the selected country.
  useEffect(() => {
    const g = globeRef.current;
    if (!g) return;
    const meta = country ? countries[country] : null;
    if (meta && country !== 'XS') {
      g.controls().autoRotate = false;
      const alt = meta.a > 3_000_000 ? 1.7 : meta.a > 500_000 ? 1.25 : 0.9;
      const mobile = window.innerWidth < 820;
      g.pointOfView({ lat: meta.p[0] - (mobile ? 12 * alt : 0), lng: meta.p[1], altitude: alt * (mobile ? 1.5 : 1) }, 1400);
    } else if (!country) {
      g.controls().autoRotate = true;
      g.pointOfView({ altitude: window.innerWidth < 820 ? 3.2 : 2.3 }, 1200);
    }
  }, [country, countries]);

  const material = useMemo(
    () =>
      new THREE.MeshPhongMaterial({
        color: new THREE.Color('#ffffff'),
        emissive: new THREE.Color('#0b1a3a'),
        emissiveIntensity: 0.25,
        shininess: 12,
      }),
    [],
  );

  const webcamPoints = useMemo(
    () => (mode === 'webcam' ? channels.filter((c) => c.p && c.c !== 'XS') : []),
    [mode, channels],
  );

  const rings = useMemo(() => {
    const out: { lat: number; lng: number; color: string }[] = [];
    const ch = playing?.channel;
    if (ch) {
      const p = ch.p && ch.c !== 'XS' ? ch.p : countries[ch.c]?.p;
      if (p) out.push({ lat: p[0], lng: p[1], color: '#f472b6' });
    }
    if (country && countries[country] && country !== playing?.channel.c) {
      const p = countries[country].p;
      out.push({ lat: p[0], lng: p[1], color: '#22d3ee' });
    }
    return out;
  }, [playing, country, countries]);

  const label = MODE_LABEL[mode];

  return (
    <div className="globe-wrap">
      <Globe
        ref={globeRef}
        width={size.w}
        height={size.h}
        backgroundColor="rgba(0,0,0,0)"
        globeImageUrl="/textures/earth-night.jpg"
        bumpImageUrl="/textures/earth-topology.png"
        globeMaterial={material}
        showAtmosphere
        atmosphereColor="#5eb8ff"
        atmosphereAltitude={0.22}
        polygonsData={features}
        polygonGeoJsonGeometry={(d: object) => (d as CountryFeature).geometry as never}
        polygonCapColor={(d: object) => {
          const f = d as CountryFeature;
          const n = f.cc ? counts.get(f.cc) || 0 : 0;
          if (f.cc === country) return 'rgba(244,114,182,0.5)';
          if (f === hover) return n ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.12)';
          if (!n) return 'rgba(255,255,255,0.025)';
          return heat(Math.log1p(n) / maxLog, mode === 'webcam' ? 0.22 : 0.42);
        }}
        polygonSideColor={() => 'rgba(120,180,255,0.08)'}
        polygonStrokeColor={(d: object) => ((d as CountryFeature).cc === country ? '#fbcfe8' : 'rgba(170,210,255,0.28)')}
        polygonAltitude={(d: object) =>
          (d as CountryFeature).cc === country ? 0.045 : d === hover ? 0.025 : 0.007
        }
        polygonsTransitionDuration={250}
        polygonLabel={(d: object) => {
          const f = d as CountryFeature;
          const meta = f.cc ? countries[f.cc] : null;
          const n = f.cc ? counts.get(f.cc) || 0 : 0;
          return `<div class="globe-tip"><span class="flag">${meta?.f ?? '🏳️'}</span><div><b>${
            meta?.n ?? f.properties.name
          }</b><small>${n ? `${n} ${n === 1 ? label.one : label.many}` : `No ${label.many} yet`}</small></div></div>`;
        }}
        onPolygonHover={(d: object | null) => {
          setHover((d as CountryFeature) || null);
          document.body.style.cursor = d ? 'pointer' : '';
        }}
        onPolygonClick={(d: object) => {
          const f = d as CountryFeature;
          if (f.cc) selectCountry(f.cc);
        }}
        pointsData={webcamPoints}
        pointLat={(d: object) => (d as Channel).p![0]}
        pointLng={(d: object) => (d as Channel).p![1]}
        pointColor={(d: object) => CAT_COLOR[(d as Channel).g[0]] || '#22d3ee'}
        pointAltitude={(d: object) => ((d as Channel).id === playing?.channel.id ? 0.12 : 0.03)}
        pointRadius={0.32}
        pointResolution={10}
        pointsMerge={false}
        pointLabel={(d: object) => {
          const c = d as Channel;
          return `<div class="globe-tip cam"><img src="${c.l}" alt=""/><div><b>${escapeHtml(c.n)}</b><small>${
            countries[c.c]?.f ?? ''
          } ${escapeHtml(c.ci || countries[c.c]?.n || '')}</small></div></div>`;
        }}
        onPointClick={(d: object) => {
          const c = d as Channel;
          play(c, channels.filter((x) => x.c === c.c));
        }}
        ringsData={rings}
        ringColor={(d: object) => (t: number) => {
          const c = new THREE.Color((d as { color: string }).color);
          return `rgba(${c.r * 255},${c.g * 255},${c.b * 255},${1 - t})`;
        }}
        ringMaxRadius={4.5}
        ringPropagationSpeed={2.4}
        ringRepeatPeriod={900}
      />
    </div>
  );
}

// On desktop the globe fills the area to the right of the sidebar.
function globeSize() {
  const offset = window.innerWidth > 820 ? sidebarOffset() : 0;
  return { w: window.innerWidth - offset, h: window.innerHeight };
}
function sidebarOffset() {
  return window.innerWidth <= 1180 ? 366 : 408;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
