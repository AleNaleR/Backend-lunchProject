import express from "express";

export const router = express.Router();

// GET / - เช็กว่าเซิร์ฟเวอร์ทำงานอยู่
router.get("/", (req, res) => {
  res.send("Get in index.ts");
});
