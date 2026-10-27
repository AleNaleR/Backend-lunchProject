import { conn } from "../dbconnect";
import { CONFIG } from "./optimizer";

export const SIM_FIRSTNAME = "ลูกค้า";
export const SIM_ADDRESS = "บ้านจำลอง";

const randInt = (min: number, max: number) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

function randomPoint(lat: number, lng: number, radiusKm: number) {
  const r = radiusKm * Math.sqrt(Math.random());
  const angle = Math.random() * 2 * Math.PI;
  const dLat = (r * Math.cos(angle)) / 111.32;
  const dLng = (r * Math.sin(angle)) / (111.32 * Math.cos((lat * Math.PI) / 180));
  return { lat: lat + dLat, lng: lng + dLng };
}

export async function simulateOrders(date: string, count: number) {
  const [rows] = await conn.query("SELECT id FROM customer");
  const ids: number[] = (rows as any[]).map((r) => r.id);

  // ลูกค้าไม่พอ → สร้างลูกค้าจำลองเพิ่ม
  let newCustomers = 0;
  while (ids.length < count) {
    const p = randomPoint(CONFIG.shop.lat, CONFIG.shop.lng, 3);
    const phone = "09" + String(randInt(0, 99999999)).padStart(8, "0");
    try {
      const [result] = await conn.query(
        "INSERT INTO customer (firstname, lastname, phone, address, lat, lng) VALUES (?, ?, ?, ?, ?, ?)",
        ["ลูกค้า", "จำลอง " + (ids.length + 1), phone, "บ้านจำลอง", p.lat, p.lng]
      );
      ids.push((result as any).insertId);
      newCustomers++;
    } catch (error: any) {
      if (error.code !== "ER_DUP_ENTRY") throw error; // เบอร์ซ้ำ ให้สุ่มใหม่
    }
  }

  // คนละ 1 ออเดอร์
  ids.sort(() => Math.random() - 0.5);
  const values = ids.slice(0, count).map((id) => [id, randInt(1, 3), date]);
  await conn.query("INSERT INTO orders (customer_id, boxes, order_date) VALUES ?", [values]);

  return { created: values.length, newCustomers, date };
}