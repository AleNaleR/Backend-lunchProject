import express from "express";
import { conn } from "../dbconnect";
import { CONFIG, minToTime } from "../services/optimizer";

export const router = express.Router();

const GMAPS = "https://www.google.com/maps/dir/?api=1";
const point = (p: { lat: number; lng: number }) => `${p.lat},${p.lng}`;

// GET /job/:code - ใบงานไรเดอร์
router.get("/:code", async (req, res) => {
  try {
    const code = req.params.code;
    if (!/^\d{6}$/.test(code)) {
      res.status(400).json({ message: "code must be 6 digits" });
      return;
    }
    const [jobRows] = await conn.query(
      `SELECT j.*, p.plan_date
       FROM job j JOIN plan p ON p.id = j.plan_id
       WHERE j.code = ?`,
      [code]
    );
    const job = (jobRows as any[])[0];
    if (!job) {
      res.status(404).json({ message: "Job not found" });
      return;
    }
    
    const [stopRows] = await conn.query("SELECT * FROM job_stop WHERE job_id = ? ORDER BY seq", [job.id]);
    const stops = (stopRows as any[]).map((s) => ({
      seq: s.seq,
      name: s.customer_name,
      phone: s.phone,
      address: s.address,
      boxes: s.boxes,
      eta: s.eta,
      lat: s.lat,
      lng: s.lng,
      mapUrl: `${GMAPS}&destination=${point(s)}`,
    }));
    const last = stops[stops.length - 1]!;
    const via = stops.slice(0, -1).map(point).join("%7C");
    res.json({
      code: job.code,
      riderNo: job.rider_no,
      color: job.color,
      date: job.plan_date,
      boxes: job.boxes,
      km: job.km,
      departTime: minToTime(CONFIG.departMinutes),
      deadlineTime: minToTime(CONFIG.deadlineMinutes),
      finishTime: job.finish_time,
      shop: CONFIG.shop,
      mapUrl: `${GMAPS}&origin=${point(CONFIG.shop)}&destination=${point(last)}` + (via ? `&waypoints=${via}` : ""),
      stops,
    });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});