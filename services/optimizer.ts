export const CONFIG = {
  shop: { lat: 16.2469, lng: 103.2522 },
  pricePerBox: 65,
  costPerBox: 40,
  riderBaseFee: 15,
  riderPerKmPerBox: 2,
  speedKmh: 30,
  maxOrdersPerRider: 3,
  departMinutes: 11 * 60 + 30,
  deadlineMinutes: 12 * 60 + 30,
  roadFactor: 1.3, 
  serviceMinutes: 2, 
};

export interface Point {
  lat: number;
  lng: number;
}

export interface Stop extends Point {
  orderId: number;
  name: string;
  phone: string;
  address: string;
  boxes: number;
}

export function distanceKm(a: Point, b: Point): number {
  const R = 6371;
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h)) * CONFIG.roadFactor;
}

export function riderFee(boxes: number, km: number): number {
  return CONFIG.riderBaseFee + CONFIG.riderPerKmPerBox * boxes * km;
}

export function minToTime(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
}

// ระยะทางนับจากร้านถึงจุดส่งสุดท้าย ไม่รวมขากลับร้าน
export function routeInfo(stops: Stop[]) {
  let prev: Point = CONFIG.shop;
  let km = 0;
  let boxes = 0;
  const arrivals: number[] = [];
  stops.forEach((s, i) => {
    km += distanceKm(prev, s);
    boxes += s.boxes;
    arrivals.push(CONFIG.departMinutes + (km / CONFIG.speedKmh) * 60 + CONFIG.serviceMinutes * i);
    prev = s;
  });
  const lateCount = arrivals.filter((t) => t > CONFIG.deadlineMinutes).length;
  return { km, boxes, fee: riderFee(boxes, km), arrivals, lateCount };
}

//แบ่งกลุ่มแบบกวาดมุม (sweep) เรียงออเดอร์ตามมุมรอบร้านแล้วตัดเป็นกลุ่มละ 3
const TWO_PI = 2 * Math.PI;

function angleFrom(s: Point, startAngle: number): number {
  const { lat: sLat, lng: sLng } = CONFIG.shop;
  const kx = Math.cos((sLat * Math.PI) / 180);
  const a = Math.atan2((s.lng - sLng) * kx, s.lat - sLat) - startAngle;
  return ((a % TWO_PI) + TWO_PI) % TWO_PI;
}

export function sweepGroups(orders: Stop[], startAngle = -Math.PI): Stop[][] {
  const sorted = [...orders].sort((a, b) => angleFrom(a, startAngle) - angleFrom(b, startAngle));
  const groups: Stop[][] = [];
  for (let i = 0; i < sorted.length; i += CONFIG.maxOrdersPerRider) {
    groups.push(sorted.slice(i, i + CONFIG.maxOrdersPerRider));
  }
  return groups;
}

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  return items.flatMap((item, i) =>
    permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest])
  );
}

export function bestOrder(group: Stop[]): Stop[] {
  let best = group;
  let bestCost = Infinity;
  for (const perm of permutations(group)) {
    const info = routeInfo(perm);
    const cost = info.lateCount * 1000 + info.km;
    if (cost < bestCost) {
      best = perm;
      bestCost = cost;
    }
  }
  return best;
}

function seededRandom(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface GroupEval {
  fee: number;
  late: number;
}

function evalGroup(group: Stop[], cache: Map<string, GroupEval>): GroupEval {
  if (group.length === 0) return { fee: 0, late: 0 };
  const key = group.map((s) => s.orderId).sort((a, b) => a - b).join(",");
  let e = cache.get(key);
  if (!e) {
    const info = routeInfo(bestOrder(group));
    e = { fee: info.fee, late: info.lateCount };
    cache.set(key, e);
  }
  return e;
}

function optimizeGroups(orders: Stop[], seed: number): Stop[][] {
  const rand = seededRandom(seed);
  const cache = new Map<string, GroupEval>();

  const score = (parts: GroupEval[]) => parts.reduce((sum, p) => sum + p.fee + p.late * 1000, 0);

  const groups = sweepGroups(orders, rand() * TWO_PI - Math.PI);
  while (groups.length < orders.length) groups.push([]);
  let parts = groups.map((g) => evalGroup(g, cache));
  let current = score(parts);

  const tryChange = (a: number, newA: Stop[], b: number, newB: Stop[]) => {
    const next = [...parts];
    next[a] = evalGroup(newA, cache);
    next[b] = evalGroup(newB, cache);
    const s = score(next);
    if (s >= current - 1e-9) return false;
    groups[a] = newA;
    groups[b] = newB;
    parts = next;
    current = s;
    return true;
  };

  const improveOnce = () => {
    const indexes = groups.map((_, i) => i);
    for (let i = indexes.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [indexes[i], indexes[j]] = [indexes[j]!, indexes[i]!];
    }
    const firstEmpty = groups.findIndex((g) => g.length === 0);
    for (const a of indexes) {
      const ga = groups[a]!;
      for (let i = 0; i < ga.length; i++) {
        for (const b of indexes) {
          if (a === b) continue;
          const gb = groups[b]!;
          const canMove = gb.length < CONFIG.maxOrdersPerRider && (gb.length > 0 || b === firstEmpty);
          if (canMove && tryChange(a, ga.filter((_, k) => k !== i), b, [...gb, ga[i]!])) return true;
          for (let j = 0; j < gb.length; j++) {
            const newA = ga.map((s, k) => (k === i ? gb[j]! : s));
            const newB = gb.map((s, k) => (k === j ? ga[i]! : s));
            if (tryChange(a, newA, b, newB)) return true;
          }
        }
      }
    }
    return false;
  };

  for (let step = 0; step < 500 && improveOnce(); step++);

  const firstAngle = (g: Stop[]) => Math.min(...g.map((s) => angleFrom(s, -Math.PI)));
  return groups.filter((g) => g.length > 0).sort((x, y) => firstAngle(x) - firstAngle(y));
}

// สุ่มเริ่มต้นหลายรอบ (ตาม seed) แล้วเลือกแผนที่ค่าไรเดอร์ต่ำที่สุด
const TRIES = 20;
// seed ที่หารด้วย 10 ลงตัว ค้นเต็ม 20 รอบ ส่วน seed อื่นค้น 3 รอบ
const triesFor = (seed: number) => (seed % 10 === 0 ? TRIES : 3);

function groupsCost(groups: Stop[][]) {
  return groups.reduce((sum, g) => {
    const info = routeInfo(bestOrder(g));
    return sum + info.fee + info.lateCount * 1000;
  }, 0);
}

function bestGroups(orders: Stop[], seed: number): Stop[][] {
  let best: Stop[][] = [];
  let bestCost = Infinity;
  for (let k = 0; k < triesFor(seed); k++) {
    const groups = optimizeGroups(orders, seed + k);
    const cost = groupsCost(groups);
    if (cost < bestCost) {
      best = groups;
      bestCost = cost;
    }
  }
  return best;
}

const RIDER_COLORS = ["#e53935", "#43a047", "#1e88e5", "#fb8c00", "#8e24aa", "#00acc1", "#6d4c41", "#d81b60", "#7cb342", "#3949ab"];

const round2 = (n: number) => Math.round(n * 100) / 100;

export function buildPlan(orders: Stop[], seed = 0) {
  const riders = bestGroups(orders, seed)
    .map(bestOrder)
    .map((stops, i) => {
      const info = routeInfo(stops);
      const finish = info.arrivals[info.arrivals.length - 1] ?? CONFIG.departMinutes;
      return {
        riderNo: i + 1,
        color: RIDER_COLORS[i % RIDER_COLORS.length]!,
        stops,
        boxes: info.boxes,
        km: round2(info.km),
        fee: round2(info.fee),
        arrivals: info.arrivals.map(minToTime),
        finishTime: minToTime(finish),
        durationMin: round2(finish - CONFIG.departMinutes),
        lateCount: info.lateCount,
      };
    });

  const boxes = riders.reduce((sum, r) => sum + r.boxes, 0);
  const revenue = boxes * CONFIG.pricePerBox;
  const foodCost = boxes * CONFIG.costPerBox;
  const riderCost = round2(riders.reduce((sum, r) => sum + r.fee, 0));
  const durationMin = Math.max(0, ...riders.map((r) => r.durationMin));

  return {
    riders,
    summary: {
      orders: orders.length,
      riders: riders.length,
      boxes,
      revenue,
      foodCost,
      riderCost,
      profit: round2(revenue - foodCost - riderCost),
      totalKm: round2(riders.reduce((sum, r) => sum + r.km, 0)),
      durationMin,
      finishTime: minToTime(CONFIG.departMinutes + durationMin),
      lateCount: riders.reduce((sum, r) => sum + r.lateCount, 0),
    },
  };
}