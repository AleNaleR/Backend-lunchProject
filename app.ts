import express from "express";
import cors from "cors";
import { router as index } from "./controller/index";
import { router as customer } from "./controller/customer";
import { router as order } from "./controller/order";
import { router as route } from "./controller/route";
import { router as job } from "./controller/job";

export const app = express();

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.text());
app.use(express.json());

// เปิดลิงก์ตามคู่มือจากเบราว์เซอร์ → ส่งต่อไปหน้าเดียวกันบนเว็บ front end (ตั้ง FRONTEND_URL) ถ้าไม่ได้ตั้งจะตอบ JSON ตามปกติ
const frontend = process.env.FRONTEND_URL?.replace(/\/+$/, "");
const pageLinks = [/^\/$/, /^\/customer(\/(nearby|\d+))?\/?$/, /^\/order(\/(nearby|simulate|\d+))?\/?$/, /^\/route\/(optimize|plan)(\/\d+)?\/?$/, /^\/job\/[^/]+\/?$/];
app.use((req, res, next) => {
  if (frontend && req.method === "GET" && req.headers.accept?.includes("text/html") && pageLinks.some((re) => re.test(req.path))) {
    res.redirect(frontend + req.originalUrl);
    return;
  }
  next();
});

app.use("/", index);
app.use("/customer", customer);
app.use("/order", order);
app.use("/route", route);
app.use("/job", job);