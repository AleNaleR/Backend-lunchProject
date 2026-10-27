// ===== ค่าตั้งต้น =====

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
  serviceMinutes: 2,
};

// ส่งสาย 1 จุด ปรับ 1000 ให้แผนที่ไม่สายชนะเสมอ
const LATE_PENALTY = 1000;

const RIDER_COLORS = ["#e53935", "#43a047", "#1e88e5", "#fb8c00", "#8e24aa", "#00acc1", "#6d4c41", "#d81b60", "#7cb342", "#3949ab"];

// ===== ชนิดข้อมูล =====

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

// เส้นทางของไรเดอร์ 1 คน
export interface Route {
  stops: Stop[];
  km: number;
  boxes: number;
  fee: number;
  arrivals: number[]; // เวลาถึงแต่ละจุด เป็นนาทีนับจากเที่ยงคืน
  lateCount: number;
}

type RouteCost = Pick<Route, "fee" | "lateCount">;

// ===== ฟังก์ชันพื้นฐาน =====

export function distanceKm(a: Point, b: Point): number {
  const R = 6371;
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function minToTime(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  const result: T[][] = [];
  for (let i = 0; i < items.length; i++) {
    for (const rest of permutations(items.toSpliced(i, 1))) {
      result.push([items[i]!, ...rest]);
    }
  }
  return result;
}

// ตัวสุ่มที่กำหนด seed ได้ seed เดิมได้เลขสุ่มชุดเดิมทุกครั้ง
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

// ===== 1. เส้นทางของไรเดอร์ 1 คน =====

// วัดเส้นทางตามลำดับจุดส่งที่ให้มา ระยะทางนับจากร้านถึงจุดส่งสุดท้าย ไม่รวมขากลับร้าน
export function measureRoute(stops: Stop[]): Route {
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
  const fee = CONFIG.riderBaseFee + CONFIG.riderPerKmPerBox * boxes * km;
  const lateCount = arrivals.filter((t) => t > CONFIG.deadlineMinutes).length;
  return { stops, km, boxes, fee, arrivals, lateCount };
}

// ลองทุกลำดับการส่งในกลุ่ม (ไม่เกิน 3! = 6 แบบ) เลือกแบบที่สายน้อยสุด แล้วระยะสั้นสุด
export function bestRoute(group: Stop[]): Route {
  let best = measureRoute(group);
  let bestScore = Infinity;
  for (const stops of permutations(group)) {
    const route = measureRoute(stops);
    const score = route.lateCount * LATE_PENALTY + route.km;
    if (score < bestScore) {
      best = route;
      bestScore = score;
    }
  }
  return best;
}

// ===== 2. แบ่งออเดอร์เป็นกลุ่ม กลุ่มละไม่เกิน 3 ออเดอร์ =====

const TWO_PI = 2 * Math.PI;
// ที่ละติจูดของร้าน ลองจิจูด 1 องศาสั้นกว่าละติจูด 1 องศา ต้องย่อก่อนคิดมุม
const LNG_SCALE = Math.cos((CONFIG.shop.lat * Math.PI) / 180);

// มุมของจุดรอบร้าน วัดจาก startAngle ได้ค่า 0 ถึง 2π
function angleAroundShop(p: Point, startAngle: number): number {
  const a = Math.atan2((p.lng - CONFIG.shop.lng) * LNG_SCALE, p.lat - CONFIG.shop.lat) - startAngle;
  return ((a % TWO_PI) + TWO_PI) % TWO_PI;
}

// ต้นทุนของแผน = ค่าไรเดอร์รวม + ค่าปรับส่งสาย ยิ่งน้อยยิ่งดี
const planCost = (costs: RouteCost[]) => costs.reduce((sum, c) => sum + c.fee + c.lateCount * LATE_PENALTY, 0);

// ค้นหาการแบ่งกลุ่ม 1 รอบ: กวาดมุมจากจุดเริ่มแบบสุ่ม แล้วปรับกลุ่มไปเรื่อย ๆ จนไม่มีทางไหนถูกลง
function searchGroups(orders: Stop[], seed: number): Stop[][] {
  const rand = seededRandom(seed);

  // กลุ่มเดียวกันจะเรียงแบบไหนก็ได้ค่าเท่ากัน จึงจำผลไว้ตามชุดเลขออเดอร์
  const costCache = new Map<string, RouteCost>();
  const groupCost = (group: Stop[]): RouteCost => {
    if (group.length === 0) return { fee: 0, lateCount: 0 };
    const key = group.map((s) => s.orderId).sort((a, b) => a - b).join(",");
    let cost = costCache.get(key);
    if (!cost) {
      cost = bestRoute(group);
      costCache.set(key, cost);
    }
    return cost;
  };

  // กวาดมุม (sweep): เรียงออเดอร์ตามมุมรอบร้านแล้วตัดเป็นกลุ่มละ 3
  const startAngle = rand() * TWO_PI - Math.PI;
  const sorted = [...orders].sort((a, b) => angleAroundShop(a, startAngle) - angleAroundShop(b, startAngle));
  const groups: Stop[][] = [];
  for (let i = 0; i < sorted.length; i += CONFIG.maxOrdersPerRider) {
    groups.push(sorted.slice(i, i + CONFIG.maxOrdersPerRider));
  }
  // เผื่อกลุ่มว่างไว้ ให้ย้ายออเดอร์ไปเปิดไรเดอร์คนใหม่ได้
  while (groups.length < orders.length) groups.push([]);
  let groupCosts = groups.map(groupCost);
  let currentCost = planCost(groupCosts);

  // เปลี่ยนกลุ่ม a, b เป็นค่าใหม่ ถ้าต้นทุนรวมลดลงจริง
  const tryChange = (a: number, newA: Stop[], b: number, newB: Stop[]) => {
    const nextCosts = [...groupCosts];
    nextCosts[a] = groupCost(newA);
    nextCosts[b] = groupCost(newB);
    const nextCost = planCost(nextCosts);
    if (nextCost >= currentCost - 1e-9) return false;
    groups[a] = newA;
    groups[b] = newB;
    groupCosts = nextCosts;
    currentCost = nextCost;
    return true;
  };

  // ลองย้ายออเดอร์ 1 ตัวไปกลุ่มอื่น หรือสลับออเดอร์ข้ามกลุ่ม เจอแบบที่ถูกลงก็เปลี่ยนทันที
  const improveOnce = () => {
    // สุ่มลำดับกลุ่มที่จะลอง
    const visitOrder = groups.map((_, i) => i);
    for (let i = visitOrder.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [visitOrder[i], visitOrder[j]] = [visitOrder[j]!, visitOrder[i]!];
    }
    const firstEmpty = groups.findIndex((g) => g.length === 0);
    for (const [posA, a] of visitOrder.entries()) {
      const groupA = groups[a]!;
      for (let i = 0; i < groupA.length; i++) {
        for (const [posB, b] of visitOrder.entries()) {
          if (a === b) continue;
          const groupB = groups[b]!;
          const canMove = groupB.length < CONFIG.maxOrdersPerRider && (groupB.length > 0 || b === firstEmpty);
          if (canMove && tryChange(a, groupA.toSpliced(i, 1), b, [...groupB, groupA[i]!])) return true;
          // คู่ที่ b มาก่อน a ลองสลับไปแล้วตอนวนถึง b
          if (posB < posA) continue;
          for (let j = 0; j < groupB.length; j++) {
            if (tryChange(a, groupA.with(i, groupB[j]!), b, groupB.with(j, groupA[i]!))) return true;
          }
        }
      }
    }
    return false;
  };

  for (let step = 0; step < 500 && improveOnce(); step++);

  const firstAngle = (g: Stop[]) => Math.min(...g.map((s) => angleAroundShop(s, -Math.PI)));
  return groups.filter((g) => g.length > 0).sort((x, y) => firstAngle(x) - firstAngle(y));
}

// ===== 3. สร้างแผนส่งพร้อมสรุปกำไร =====

export function buildPlan(orders: Stop[], seed = 0) {
  // ค้นหลายรอบแล้วเลือกแผนที่ถูกที่สุด seed ที่หารด้วย 10 ลงตัวค้น 20 รอบ ส่วน seed อื่นค้น 3 รอบ
  const tries = seed % 10 === 0 ? 20 : 3;
  let routes: Route[] = [];
  let bestCost = Infinity;
  for (let k = 0; k < tries; k++) {
    const candidate = searchGroups(orders, seed + k).map(bestRoute);
    const cost = planCost(candidate);
    if (cost < bestCost) {
      routes = candidate;
      bestCost = cost;
    }
  }

  const riders = routes.map((route, i) => {
    const finish = route.arrivals.at(-1) ?? CONFIG.departMinutes;
    return {
      riderNo: i + 1,
      color: RIDER_COLORS[i % RIDER_COLORS.length]!,
      stops: route.stops,
      boxes: route.boxes,
      km: round2(route.km),
      fee: round2(route.fee),
      arrivals: route.arrivals.map(minToTime),
      finishTime: minToTime(finish),
      durationMin: round2(finish - CONFIG.departMinutes),
      lateCount: route.lateCount,
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
