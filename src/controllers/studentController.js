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

// -------- AUTH ----------
export const studentLogin = asyncHandler(async (req, res) => {
  const { email, password, deviceId } = req.body;
  if (!deviceId) return res.status(400).json({ message: "deviceId is required" });

  const student = await Student.findOne({ email });
  if (!student) return res.status(401).json({ message: "Invalid credentials" });

  const ok = await verifyPassword(password, student.passwordHash);
  if (!ok) return res.status(401).json({ message: "Invalid credentials" });

  const isKnown = student.activeDevices.includes(deviceId);
  if (!isKnown && student.activeDevices.length >= student.deviceLimit) {
    return res.status(403).json({ message: "Device limit reached" });
  }
  if (!isKnown) {
    student.activeDevices.push(deviceId);
    await student.save();
  }

  const token = jwt.sign(
    { sub: student._id, role: "student", deviceId },
    process.env.JWT_SECRET,
    { expiresIn: "8h" }
  );

  res.json({ token });
});

// -------- LOGOUT ----------
export const studentLogout = asyncHandler(async (req, res) => {
  const { deviceId } = req.body;
  const student = await Student.findById(req.studentId);
  if (student && deviceId) {
    student.activeDevices = student.activeDevices.filter((d) => d !== deviceId);
    await student.save();
  }
  res.json({ message: "Logged out" });
});

// -------- PASSWORD ----------
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

// -------- RESOURCES ----------
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

  // Verify that student is allowed to access this resource
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

    // Only allow PDF preview
    if (!resource.title.toLowerCase().endsWith(".pdf")) {
      return res
        .status(403)
        .json({ message: "Preview not allowed for this file type" });
    }

    // Get signed S3 URL
    const url = await getSignedReadUrl(resource.s3Key, 300);

    // Stream directly to frontend
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