import express from "express";
import { conn } from "../dbconnect";
import { CustomerPostRequest } from "../model/customer";
import { DISTANCE_KM_SQL, parseNearby } from "../services/geo";

export const router = express.Router();

// GET /customer - ดูรายชื่อลูกค้า
router.get("/", async (req, res) => {
  try {
    const where: string[] = [];
    const params: string[] = [];

    const like = (v: unknown) => "%" + String(v).trim() + "%";
    if (req.query.name) {
      where.push("(firstname LIKE ? OR lastname LIKE ?)");
      params.push(like(req.query.name), like(req.query.name));
    }
    
    if (req.query.firstname) { where.push("firstname LIKE ?"); params.push(like(req.query.firstname)); }
    if (req.query.lastname) { where.push("lastname LIKE ?"); params.push(like(req.query.lastname)); }

    const sql = "SELECT * FROM customer" + (where.length ? " WHERE " + where.join(" AND ") : "");
    const [rows] = await conn.query(sql, params);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /customer - เพิ่มลูกค้า
router.post("/", async (req, res) => {
  try {
    const c: CustomerPostRequest = req.body;
    if (!c?.firstname || !c?.lastname || !c?.phone || c.lat === undefined || c.lng === undefined) {
      res.status(400).json({ message: "firstname, lastname, phone, lat, lng are required" });
      return;
    }
    const [result] = await conn.query(
      "INSERT INTO customer (firstname, lastname, phone, address, lat, lng) VALUES (?, ?, ?, ?, ?, ?)",
      [c.firstname, c.lastname, c.phone, c.address ?? "", c.lat, c.lng]
    );
    const r = result as any;
    res.status(201).json({ affected_row: r.affectedRows, last_idx: r.insertId });
  } catch (error: any) {
    if (error.code === "ER_DUP_ENTRY") {
      res.status(409).json({ message: "phone already exists" });
      return;
    }
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /customer/nearby - ค้นลูกค้าใกล้พิกัด
router.get("/nearby", async (req, res) => {
  try {
    const q = parseNearby(req.query, 1);
    if (typeof q === "string") {
      res.status(400).json({ message: q });
      return;
    }
    const [rows] = await conn.query(
      `SELECT * FROM (
         SELECT c.*, ROUND(${DISTANCE_KM_SQL("c.lat", "c.lng")}, 3) AS distance_km
         FROM customer c
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

// PUT /customer/:id - แก้ไขลูกค้า
router.put("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ message: "id must be an integer" });
      return;
    }
    const [rows] = await conn.query("SELECT * FROM customer WHERE id = ?", [id]);

    const found = rows as any[];
    if (found.length === 0) {
      res.status(404).json({ message: "Customer not found" });
      return;
    }

    const updated = { ...found[0], ...req.body };

    const [result] = await conn.query(
      "UPDATE customer SET firstname = ?, lastname = ?, phone = ?, address = ?, lat = ?, lng = ? WHERE id = ?",
      [updated.firstname, updated.lastname, updated.phone, updated.address, updated.lat, updated.lng, id]
    );
    const r = result as any;
    res.status(200).json({ affected_row: r.affectedRows });
  } catch (error: any) {
    if (error.code === "ER_DUP_ENTRY") {
      res.status(409).json({ message: "phone already exists" });
      return;
    }
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /customer/:id - ลบลูกค้า
router.delete("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ message: "id must be an integer" });
      return;
    }
    const [cnt] = await conn.query("SELECT COUNT(*) AS n FROM orders WHERE customer_id = ?", [id]);
    const orderCount = Number((cnt as any[])[0].n);

    if (orderCount > 0 && req.query.force !== "true") {
      res.status(409).json({ message: `Customer has ${orderCount} order(s). Use ?force=true` });
      return;
    }
    if (orderCount > 0) {
      await conn.query("DELETE FROM orders WHERE customer_id = ?", [id]);
    }
    const [result] = await conn.query("DELETE FROM customer WHERE id = ?", [id]);
    const r = result as any;
    if (r.affectedRows === 0) {
      res.status(404).json({ message: "Customer not found" });
      return;
    }
    res.json({ affected_row: r.affectedRows });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});