// Solmar Bay — the city. Deterministic layout: roads on a grid, districts with their
// own palettes, buildings as collision rects, plus landmarks the story needs.
import { TILE, WORLD_W, WORLD_H, ROADS_V, ROADS_H, ROAD_W, BEACH_X, rand, clamp } from './config.js';

export function buildCity(seed = 1337) {
  const s = { s: seed };
  const buildings = [];
  const houses = [];
  const palms = [];
  const cctv = [];
  const parkingSpots = [];
  const parks = [];

  const roadSetV = new Set(ROADS_V);
  const roadSetH = new Set(ROADS_H);

  function isRoad(x, y) {
    if (x < BEACH_X) return false;
    for (const rx of ROADS_V) if (Math.abs(x - rx) < ROAD_W / 2 + 24) return true;
    for (const ry of ROADS_H) if (Math.abs(y - ry) < ROAD_W / 2 + 24) return true;
    return false;
  }

  // Blocks: the rectangles strictly BETWEEN roads (road edge = centre ± 62 px,
  // road 96 wide plus 14 px sidewalk each side), so no building ever sits on a road.
  const xEdges = [640, ...ROADS_V.map((r) => r + ROAD_W / 2 + 14)];
  const xRights = [...ROADS_V.map((r) => r - ROAD_W / 2 - 14), WORLD_W - 60];
  const yEdges = [60, ...ROADS_H.map((r) => r + ROAD_W / 2 + 14)];
  const yRights = [...ROADS_H.map((r) => r - ROAD_W / 2 - 14), WORLD_H - 60];

  const roofColors = ['#6b5b4f', '#4f5b6b', '#7a4f5b', '#5b6b4f', '#715f7a'];
  const houseColors = ['#b5542e', '#2e6b8a', '#c98a3a', '#7a8a3a', '#8a4f6b'];

  for (let bi = 0; bi < xEdges.length; bi++) {
    for (let bj = 0; bj < yEdges.length; bj++) {
      const x0 = xEdges[bi];
      const y0 = yEdges[bj];
      const x1 = xRights[bi];
      const y1 = yRights[bj];
      const w = x1 - x0;
      const h = y1 - y0;
      if (w < 150 || h < 150) {
        // Thin strip (e.g. the beachfront edge): palms only, no buildings.
        if (w >= 60 && h >= 60) {
          palms.push({ x: x0 + 20 + rand(s) * Math.max(1, w - 40), y: y0 + 20 + rand(s) * Math.max(1, h - 40) });
          palms.push({ x: x0 + 20 + rand(s) * Math.max(1, w - 40), y: y0 + 20 + rand(s) * Math.max(1, h - 40) });
        }
        continue;
      }
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      const downtown = cx > 1500 && cx < 2600 && cy > 500 && cy < 1800;
      const suburb = cy > 2200 && cx < 2600;
      const port = cx > 2900 && cy < 1900;
      const r = rand(s);
      if (r < 0.12) {
        // Park / empty lot with palms.
        parks.push({ x: x0, y: y0, w, h });
        const n = 3 + Math.floor(rand(s) * 5);
        for (let i = 0; i < n; i++) {
          palms.push({ x: x0 + 30 + rand(s) * (w - 60), y: y0 + 30 + rand(s) * (h - 60) });
        }
        continue;
      }
      if (port) {
        // Warehouse row.
        buildings.push({
          x: x0 + 10, y: y0 + 10, w: w - 20, h: h - 20,
          color: '#7d838d', kind: 'warehouse', height: 1,
        });
        continue;
      }
      if (suburb) {
        // Two small houses per block.
        const hw = Math.min(150, w / 2 - 20);
        const hh = Math.min(130, h - 30);
        houses.push({ x: x0 + 12, y: y0 + 14, w: hw, h: hh, color: houseColors[Math.floor(rand(s) * houseColors.length)] });
        houses.push({ x: x0 + w / 2 + 8, y: y0 + 14, w: hw, h: hh, color: houseColors[Math.floor(rand(s) * houseColors.length)] });
        palms.push({ x: x0 + 24, y: y0 + h - 24 });
        palms.push({ x: x1 - 24, y: y0 + h - 24 });
        continue;
      }
      if (downtown) {
        // One tall tower per block.
        const tw = Math.min(220, w - 40);
        const th = Math.min(200, h - 40);
        buildings.push({
          x: cx - tw / 2, y: cy - th / 2, w: tw, h: th,
          color: roofColors[Math.floor(rand(s) * roofColors.length)],
          kind: 'tower', height: 2 + Math.floor(rand(s) * 3),
        });
      } else {
        // Mid-rise block.
        buildings.push({
          x: x0 + 14, y: y0 + 14, w: w - 28, h: h - 28,
          color: roofColors[Math.floor(rand(s) * roofColors.length)],
          kind: 'block', height: 1 + Math.floor(rand(s) * 2),
        });
      }
      if (rand(s) < 0.5) palms.push({ x: x0 + 20, y: y0 + 20 });
    }
  }

  // Beach palms along the boardwalk.
  for (let y = 120; y < WORLD_H - 100; y += 170) {
    palms.push({ x: 560 + rand(s) * 40, y });
    if (rand(s) < 0.6) palms.push({ x: 700 + rand(s) * 60, y: y + 60 });
  }

  // CCTV cameras on downtown corners and the jewelry store.
  const camSpots = [
    [1760, 640], [2240, 640], [1760, 1120], [2240, 1120], [1760, 1600],
    [2240, 1600], [1280, 1120], [2720, 1120], [3200, 1600],
  ];
  for (const [x, y] of camSpots) cctv.push({ x, y, range: 320, angle: rand(s) * Math.PI * 2 });

  // Parked cars along roads (spawn spots for stealable cars).
  for (let i = 0; i < 26; i++) {
    const vertical = rand(s) < 0.5;
    if (vertical) {
      const rx = ROADS_V[Math.floor(rand(s) * ROADS_V.length)];
      const ry = 300 + rand(s) * (WORLD_H - 600);
      parkingSpots.push({ x: rx + (rand(s) < 0.5 ? -62 : 62), y: ry, angle: Math.PI / 2 });
    } else {
      const ry = ROADS_H[Math.floor(rand(s) * ROADS_H.length)];
      const rx = 700 + rand(s) * (WORLD_W - 1000);
      parkingSpots.push({ x: rx, y: ry + (rand(s) < 0.5 ? -62 : 62), angle: 0 });
    }
  }

  // Named landmarks (story locations).
  const landmarks = {
    safehouse: { x: 1100, y: 2900, label: 'Safehouse — Cole & Lena' },
    prison: { x: 2700, y: 180, label: 'Costa Alta Correctional' },
    gunshop: { x: 3150, y: 900, label: 'Steel & Smoke Pawn' },
    jewelry: { x: 1980, y: 1380, label: 'Casa Blanca Jewels' },
    marina: { x: 700, y: 500, label: 'Marina — Felix’s Boat' },
    felixYard: { x: 3050, y: 1750, label: 'Ortega Boat Yard' },
    beach: { x: 560, y: 1900, label: 'Neon Shore' },
    downtown: { x: 2000, y: 1100, label: 'Downtown Solmar' },
  };

  return { buildings, houses, palms, cctv, parkingSpots, parks, landmarks, isRoad };
}

export function collideBuildings(city, x, y, radius) {
  // Returns true if a circle at (x,y) hits any building/house or the world edge / ocean.
  if (x < BEACH_X + radius || x > WORLD_W - radius || y < radius || y > WORLD_H - radius) return true;
  for (const b of city.buildings) {
    if (x + radius > b.x && x - radius < b.x + b.w && y + radius > b.y && y - radius < b.y + b.h) return true;
  }
  for (const h of city.houses) {
    if (x + radius > h.x && x - radius < h.x + h.w && y + radius > h.y && y - radius < h.y + h.h) return true;
  }
  return false;
}

export function nearestRoadPoint(x, y) {
  // Snap a point to the nearest road centre line (for traffic spawns).
  let best = null;
  let bestD = Infinity;
  for (const rx of ROADS_V) {
    const d = Math.abs(x - rx);
    if (d < bestD) { bestD = d; best = { x: rx, y: clamp(y, 200, WORLD_H - 200), vertical: true }; }
  }
  for (const ry of ROADS_H) {
    const d = Math.abs(y - ry);
    if (d < bestD) { bestD = d; best = { x: clamp(x, 700, WORLD_W - 200), y: ry, vertical: false }; }
  }
  return best;
}
