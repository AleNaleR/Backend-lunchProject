import express from "express";
import { conn } from "../dbconnect";
import { OrderPostRequest } from "../model/order";
import { simulateOrders, SIM_FIRSTNAME, SIM_ADDRESS } from "../services/simulate";
import { DISTANCE_KM_SQL, parseNearby } from "../services/geo";

export const router = express.Router();

const today = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });

const validBoxes = (b: unknown) => Number.isInteger(b) && (b as number) >= 1 && (b as number) <= 3;
const validDate = (d: unknown) => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d);

// GET /order/nearby - ค้นออเดอร์ใกล้พิกัด
router.get("/nearby", async (req, res) => {
  try {
    const q = parseNearby(req.query, 2);
    if (typeof q === "string") {
      res.status(400).json({ message: q });
      return;
    }
    const [rows] = await conn.query(
      `SELECT * FROM (
         SELECT o.id, o.customer_id, o.boxes, o.order_date,
                c.firstname, c.lastname, c.phone, c.address, c.lat, c.lng,
                ROUND(${DISTANCE_KM_SQL("c.lat", "c.lng")}, 3) AS distance_km
         FROM orders o JOIN customer c ON c.id = o.customer_id
       ) t
       WHERE distance_km <= ?
       ORDER BY distance_km`,
      [q.lat, q.lat, q.lng, q.radius]
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /order - ดูออเดอร์ตามวัน
router.get("/", async (req, res) => {
  try {
    const date = req.query.date ? String(req.query.date) : today();
    if (!validDate(date)) {
      res.status(400).json({ message: "date must be YYYY-MM-DD" });
      return;
    }
    const [rows] = await conn.query(
      `SELECT o.id, o.customer_id, o.boxes, o.order_date,
              c.firstname, c.lastname, c.phone, c.address, c.lat, c.lng,
              (SELECT j.plan_id FROM job_stop s JOIN job j ON j.id = s.job_id
               WHERE s.order_id = o.id ORDER BY j.plan_id DESC LIMIT 1) AS plan_id,
              (SELECT j.code FROM job_stop s JOIN job j ON j.id = s.job_id
               WHERE s.order_id = o.id ORDER BY j.plan_id DESC LIMIT 1) AS job_code
       FROM orders o JOIN customer c ON c.id = o.customer_id
       WHERE o.order_date = ?
       ORDER BY o.id`,
      [date]
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /order - เพิ่มออเดอร์
router.post("/", async (req, res) => {
  try {
    const o: OrderPostRequest = req.body;
    const date = o?.date ?? today();
    
    if (!o?.customerId || !validBoxes(o.boxes) || !validDate(date)) {
      res.status(400).json({ message: "customerId and boxes (1-3) are required, date must be YYYY-MM-DD" });
      return;
    }

    const [cust] = await conn.query("SELECT id FROM customer WHERE id = ?", [o.customerId]);
    if ((cust as any[]).length === 0) {
      res.status(404).json({ message: "Customer not found" });
      return;
    }

    const [result] = await conn.query(
      "INSERT INTO orders (customer_id, boxes, order_date) VALUES (?, ?, ?)",
      [o.customerId, o.boxes, date]
    );
    
    const r = result as any;
    res.status(201).json({ affected_row: r.affectedRows, last_idx: r.insertId });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /order/:id - แก้จำนวนกล่อง
router.put("/:id", async (req, res) => {
  try {
    if (!validBoxes(req.body?.boxes)) {
      res.status(400).json({ message: "boxes must be an integer 1-3" });
      return;
    }
    const [result] = await conn.query("UPDATE orders SET boxes = ? WHERE id = ?", [
      req.body.boxes,
      req.params.id,
    ]);
    const r = result as any;
    if (r.affectedRows === 0) {
      res.status(404).json({ message: "Order not found" });
      return;
    }
    res.status(200).json({ affected_row: r.affectedRows });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /order/simulate - ล้างออเดอร์ทั้งหมด
router.delete("/simulate", async (req, res) => {
  try {
    const [o] = await conn.query("DELETE FROM orders");
    let deletedCustomers = 0;
    if (req.query.customers === "true") {
      const [c] = await conn.query(
        "DELETE FROM customer WHERE firstname = ? AND address = ?",
        [SIM_FIRSTNAME, SIM_ADDRESS]
      );
      deletedCustomers = (c as any).affectedRows;
    }
    res.json({ deleted_orders: (o as any).affectedRows, deleted_customers: deletedCustomers });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /order/:id - ลบออเดอร์
router.delete("/:id", async (req, res) => {
  try {
    const [result] = await conn.query("DELETE FROM orders WHERE id = ?", [req.params.id]);
    const r = result as any;
    if (r.affectedRows === 0) {
      res.status(404).json({ message: "Order not found" });
      return;
    }
    res.status(200).json({ affected_row: r.affectedRows });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /order/simulate - จำลองออเดอร์
router.post("/simulate", async (req, res) => {
  try {
    const date = req.body?.date ?? today();
    if (!validDate(date)) {
      res.status(400).json({ message: "date must be YYYY-MM-DD" });
      return;
    }
    const wanted = Number(req.body?.count) || Math.floor(Math.random() * 11) + 20;
    const count = Math.min(Math.max(wanted, 1), 60);
    res.status(201).json(await simulateOrders(date, count));
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});