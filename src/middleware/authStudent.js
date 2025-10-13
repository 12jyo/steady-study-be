import jwt from "jsonwebtoken";

const authStudent = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Missing or invalid token" });
  }

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.studentId = decoded.sub;
    req.deviceId = decoded.deviceId;
    next();
  } catch (err) {
    console.error("JWT verify failed:", err.message);
    res.status(401).json({ message: "Invalid token" });
  }
};

export default authStudent;