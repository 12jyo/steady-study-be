import asyncHandler from "express-async-handler";
import jwt from "jsonwebtoken";
import { verifyPassword, hashPassword } from "../utils/passwords.js";
import { getSignedReadUrl } from "../utils/s3.js";
import Student from "../models/Student.js";
import BRM from "../models/BatchResourceMapping.js";
import Resource from "../models/Resource.js";
import StudentBatchMapping from "../models/StudentBatchMapping.js";
import axios from 'axios';
import mime from "mime-types";
import { Parser } from "json2csv";

export const studentLogin = asyncHandler(async (req, res) => {
  const { email, password, deviceId } = req.body;
  if (!deviceId) return res.status(400).json({ message: "deviceId is required" });

  const student = await Student.findOne({ email });
  if (!student) return res.status(401).json({ message: "Invalid credentials" });

  const ok = await verifyPassword(password, student.passwordHash);
  if (!ok) return res.status(401).json({ message: "Invalid credentials" });

  let devices = student.activeDevices || [];
  let deviceTokens = student.deviceTokens || [];

  const deviceIndex = devices.indexOf(deviceId);

  // JWT expiration
  const expiresIn = 8 * 60 * 60; // 8 hours in seconds
  const expiresAt = new Date(Date.now() + expiresIn * 1000);

  if (deviceIndex === -1) {
    if (devices.length >= student.deviceLimit) {
      // Remove the oldest device and its token
      const removedDeviceId = devices.shift();
      deviceTokens = deviceTokens.filter(dt => dt.deviceId !== removedDeviceId);
    }
    devices.push(deviceId);
  }

  // Generate new token for this device
  const token = jwt.sign(
    { sub: student._id, role: "", deviceId },
    process.env.JWT_SECRET,
    { expiresIn }
  );

  // Remove any old token for this deviceId, then add the new one
  deviceTokens = deviceTokens.filter(dt => dt.deviceId !== deviceId);
  deviceTokens.push({ deviceId, token, expiresAt });

  student.activeDevices = devices;
  student.deviceTokens = deviceTokens;
  await student.save();

  res.json({ token, name: student.name, studentId: student._id });
});

export const studentLogout = asyncHandler(async (req, res) => {
  const { deviceId } = req.body;
  const student = await Student.findById(req.studentId);
  if (student && deviceId) {
    student.activeDevices = student.activeDevices.filter((d) => d !== deviceId);
    await student.save();
  }
  res.json({ message: "Logged out" });
});

export const changePassword = asyncHandler(async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  const student = await Student.findById(req.studentId);
  if (!student) return res.status(404).json({ message: "Student not found" });

  const ok = await verifyPassword(oldPassword, student.passwordHash);
  if (!ok) return res.status(400).json({ message: "Old password incorrect" });

  student.passwordHash = await hashPassword(newPassword);
  await student.save();

  res.json({ message: "Password changed successfully" });
});

export const listMyResources = asyncHandler(async (req, res) => {
  const student = await Student.findById(req.studentId).select("batchIds");
  if (!student || !student.batchIds?.length) return res.json([]);

  const mappings = await BRM.find({ batchId: { $in: student.batchIds } }).lean();
  const resIds = mappings.map((m) => m.resId);
  if (!resIds.length) return res.json([]);

  const resources = await Resource.find({ _id: { $in: resIds } }).select(
    "_id title createdAt s3Key"
  );

  const resourcesWithUrls = await Promise.all(
    resources.map(async (r) => ({
      _id: r._id,
      title: r.title,
      createdAt: r.createdAt,
      url: r.s3Key ? await getSignedReadUrl(r.s3Key, 60 * 5) : null,
    }))
  );

  res.json(resourcesWithUrls);
});


export const getResourceSigned = asyncHandler(async (req, res) => {
  const { resource_id } = req.params;

  const mappings = await BRM.find({ resId: resource_id }).lean();
  const allowedBatchIds = mappings.map((m) => m.batchId.toString());

  const studentBatches = await StudentBatchMapping.find({
    studentId: req.studentId,
    batchId: { $in: allowedBatchIds }
  });

  if (!studentBatches.length) {
    return res.status(403).json({ message: "Access denied" });
  }

  const resource = await Resource.findById(resource_id);
  if (!resource) return res.status(404).json({ message: "Resource not found" });

  const url = await getSignedReadUrl(resource.s3Key, 60 * 5);
  res.json({ url, expiresIn: 300 });
});

export const getResourceFile = async (req, res) => {
  const { id } = req.params;

  try {
    const resource = await Resource.findById(id);
    if (!resource) return res.status(404).json({ message: "Resource not found" });

    if (!resource.title.toLowerCase().endsWith(".pdf")) {
      return res
        .status(403)
        .json({ message: "Preview not allowed for this file type" });
    }

    const url = await getSignedReadUrl(resource.s3Key, 300);

    const s3Stream = await axios.get(url, { responseType: "stream" });

    const mimeType = mime.lookup(resource.title) || "application/pdf";
    res.setHeader("Content-Type", mimeType);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Disposition", "inline");

    s3Stream.data.pipe(res);
  } catch (err) {
    console.error("Stream error:", err.message);
    res.status(500).json({ message: "Failed to stream file" });
  }
};

export const resetPasswordForStudent = asyncHandler(async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: "Email is required" });

  const student = await Student.findOne({ _id: req.studentId, email });
  if (!student) return res.status(404).json({ message: "Student not found" });

  const newPassword = Math.random().toString(36).slice(-8);
  student.passwordHash = await hashPassword(newPassword);
  await student.save();

  const fields = ["name", "email", "newPassword"];
  const data = [{
    name: student.name || "",
    email: student.email,
    newPassword
  }];
  const parser = new Parser({ fields });
  const csv = parser.parse(data);

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename=student-password-reset-${student._id}.csv`);
  res.send(csv);
});