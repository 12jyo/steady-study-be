import jwt from "jsonwebtoken";

export default function authAdmin(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: "No token" });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== "admin") throw new Error("bad role");
    req.adminId = decoded.sub;
    next();
  } catch {
    return res.status(401).json({ message: "Invalid token" });
  }
}
