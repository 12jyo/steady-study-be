import jwt from "jsonwebtoken";
import Student from "../models/Student.js";

const authStudent = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Missing or invalid token" });
  }

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const student = await Student.findById(decoded.sub);
    if (!student) return res.status(401).json({ message: "Invalid token" });

    // Check deviceId and token validity
    const deviceId = decoded.deviceId;
    const deviceTokenEntry = student.deviceTokens.find(
      dt => dt.deviceId === deviceId && dt.token === token
    );
    if (!deviceTokenEntry) {
      return res.status(401).json({ message: "Logged out due to device limit" });
    }
    // Optionally, check expiry (should be handled by JWT, but for extra safety)
    if (deviceTokenEntry.expiresAt < new Date()) {
      return res.status(401).json({ message: "Session expired" });
    }

    req.user = student;
    req.studentId = student._id;
    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid token" });
  }
};

export default authStudent;