import "dotenv/config";
import express from "express";
import cors from "cors";
import { connectDB } from "./config/db.js";
import adminRoutes from "./routes/admin.js";
import studentRoutes from "./routes/student.js";
import Admin from "./models/Admin.js";
import { hashPassword } from "./utils/passwords.js";

const app = express();

app.use(
  cors({
    origin: "http://localhost:5173",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

app.use(express.json({ limit: "5mb" }));

app.get("/", (_req, res) => res.send("Student Resources API"));

app.use("/admin", adminRoutes);
app.use("/student", studentRoutes);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ message: "Internal error" });
});

const port = process.env.PORT || 4000;
connectDB().then(async () => {
  const count = await Admin.countDocuments();
  if (!count) {
    const email = "admin@example.com";
    const password = "admin123";
    await Admin.create({ email, passwordHash: await hashPassword(password) });
    console.log(`Seeded admin: ${email} / ${password}`);
  }
  app.listen(port, () =>
    console.log(`Server running on http://localhost:${port}`)
  );
});