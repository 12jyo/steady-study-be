import asyncHandler from "express-async-handler";
import Joi from "joi";
import jwt from "jsonwebtoken";
import { hashPassword } from "../utils/passwords.js";
import { uploadBufferToS3 } from "../utils/s3.js";
import Admin from "../models/Admin.js";
import Student from "../models/Student.js";
import Batch from "../models/Batch.js";
import Resource from "../models/Resource.js";
import BRM from "../models/BatchResourceMapping.js";
import StudentBatchMapping from "../models/StudentBatchMapping.js";
import crypto from "crypto";
import { Parser } from "json2csv";
import { deleteFileFromS3 } from "../utils/s3.js";

export const generatePassword = () => crypto.randomBytes(4).toString("hex");

export const adminLogin = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const admin = await Admin.findOne({ email });
  if (!admin) return res.status(401).json({ message: "Invalid credentials" });
  const { verifyPassword } = await import("../utils/passwords.js");
  const ok = await verifyPassword(password, admin.passwordHash);
  if (!ok) return res.status(401).json({ message: "Invalid credentials" });

  const token = jwt.sign({ sub: admin._id, role: "admin" }, process.env.JWT_SECRET, { expiresIn: "8h" });
  res.json({ token });
});

export const adminLogout = asyncHandler(async (_req, res) => {
  res.json({ message: "Logged out" });
});

export const enrollStudent = asyncHandler(async (req, res) => {
  const schema = Joi.object({
    name: Joi.string().required(),
    email: Joi.string().email().required(),
  });
  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ message: error.details[0].message });

  const { name, email } = value;
  const exists = await Student.findOne({ email });
  if (exists) return res.status(409).json({ message: "Email already exists" });

  const password = generatePassword();
  const passwordHash = await hashPassword(password);

  const student = await Student.create({
    name,
    email,
    passwordHash,
    deviceLimit: 2,
  });

  res.status(201).json({
    id: student._id,
    name: student.name,
    email: student.email,
    password,
    message: "Student enrolled successfully",
  });
});

export const setStudentPassword = asyncHandler(async (req, res) => {
  const schema = Joi.object({
    studentId: Joi.string().required(),
    newPassword: Joi.string().min(6).required(),
  });
  const { error, value } = schema.validate(req.body);
  if (error) {
    return res.status(400).json({ message: error.details[0].message });
  }
  const { studentId, newPassword } = value;
  const passwordHash = await hashPassword(newPassword);
  await Student.findByIdAndUpdate(studentId, { passwordHash });
  res.json({ message: "Password updated successfully" });
});

export const addStudentToBatch = asyncHandler(async (req, res) => {
  const schema = Joi.object({
    batchId: Joi.string().regex(/^[0-9a-fA-F]{24}$/).required(),
    studentId: Joi.string().regex(/^[0-9a-fA-F]{24}$/).required(),
  });
  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ message: error.details[0].message });

  const { batchId, studentId } = value;
  const batchExists = await Batch.exists({ _id: batchId });
  const studentExists = await Student.exists({ _id: studentId });
  if (!batchExists || !studentExists)
    return res.status(404).json({ message: "Batch or Student not found" });

  await StudentBatchMapping.updateOne(
    { batchId, studentId },
    { $set: { batchId, studentId } },
    { upsert: true }
  );
  res.json({ message: "Student added to batch successfully" });
});

export const setStudentDeviceLimit = asyncHandler(async (req, res) => {
  const schema = Joi.object({
    studentId: Joi.string().required(),
    deviceLimit: Joi.number().integer().min(1).max(5).required(),
  });

  const { error, value } = schema.validate(req.body);
  if (error)
    return res.status(400).json({ message: error.details[0].message });

  const { studentId, deviceLimit } = value;

  const student = await Student.findById(studentId);
  if (!student) return res.status(404).json({ message: "Student not found" });

  await Student.findByIdAndUpdate(studentId, { deviceLimit });
  res.json({ message: `Device limit updated to ${deviceLimit}` });
});

export const createBatch = asyncHandler(async (req, res) => {
  const { title } = req.body;
  if (!title) return res.status(400).json({ message: "Batch title is required" });

  const batch = await Batch.create({ title });
  res.status(201).json({ id: batch._id, title: batch.title });
});

export const listBatches = asyncHandler(async (_req, res) => {
  const batches = await Batch.find().select("_id title createdAt");
  res.json(batches);
});

export const listStudentsByBatch = asyncHandler(async (req, res) => {
  const { batch_id } = req.query;

  if (!batch_id) {
    const allStudents = await Student.find().select("_id email deviceLimit activeDevices");
    return res.json(allStudents);
  }

  const mappings = await StudentBatchMapping.find({ batchId: batch_id });
  const ids = mappings.map((m) => m.studentId);
  const students = await Student.find({ _id: { $in: ids } })
    .select("_id name email deviceLimit activeDevices");
  return res.json(students);
});

export const listAllStudents = asyncHandler(async (_req, res) => {
  const students = await Student.find()
    .populate("batchIds", "title")
    .select("_id name email deviceLimit batchIds");
  res.json(students);
});

// ---------- RESOURCES ----------
export const uploadResourceToBatch = asyncHandler(async (req, res) => {
  const { batchId, title } = req.body;
  if (!req.file) return res.status(400).json({ message: "No file" });

  const originalName = req.file.originalname;
  const key = `batch/${batchId}/${Date.now()}_${originalName}`;
  await uploadBufferToS3(req.file.buffer, key, originalName);

  const resource = await Resource.create({ title: title || originalName, s3Key: key });
  await BRM.create({ batchId, resId: resource._id });

  res.status(201).json({ resourceId: resource._id, title: resource.title });
});

export const listResourcesByBatch = asyncHandler(async (req, res) => {
  const { batch_id } = req.query;
  if (!batch_id) return res.status(400).json({ message: "batch_id is required" });

  const map = await BRM.find({ batchId: batch_id }).lean();
  const ids = map.map((m) => m.resId);
  const resources = await Resource.find({ _id: { $in: ids } }).select("_id title createdAt s3Key");

  const { getSignedReadUrl } = await import("../utils/s3.js");

  const resourcesWithUrls = await Promise.all(
    resources.map(async (resource) => {
      let url = null;
      if (resource.s3Key) {
        try {
          url = await getSignedReadUrl(resource.s3Key, 60 * 5);
        } catch {
          url = null;
        }
      }
      return {
        _id: resource._id,
        title: resource.title,
        createdAt: resource.createdAt,
        url,
      };
    })
  );

  res.json(resourcesWithUrls);
});

export const resetStudentPassword = asyncHandler(async (req, res) => {
  const { studentId } = req.body;
  if (!studentId) return res.status(400).json({ message: "studentId is required" });

  const student = await Student.findById(studentId);
  if (!student) return res.status(404).json({ message: "Student not found" });

  const newPassword = generatePassword();
  const passwordHash = await hashPassword(newPassword);
  await Student.findByIdAndUpdate(studentId, { passwordHash });

  const parser = new Parser({ fields: ["name", "email", "password"] });
  const csv = parser.parse([{ name: student.name, email: student.email, password: newPassword }]);

  res.setHeader("Content-Disposition", `attachment; filename=reset_password_${student.email}.csv`);
  res.set("Content-Type", "text/csv");
  res.status(200).send(csv);
});

export const assignBatchesToStudent = asyncHandler(async (req, res) => {
  const schema = Joi.object({
    studentId: Joi.string().required(),
    batchIds: Joi.array().items(Joi.string()).required(),
  });

  const { error, value } = schema.validate(req.body);
  if (error)
    return res.status(400).json({ message: error.details[0].message });

  const { studentId, batchIds } = value;
  const student = await Student.findById(studentId);
  if (!student) return res.status(404).json({ message: "Student not found" });

  await Student.findByIdAndUpdate(studentId, { batchIds }, { new: true });

  res.json({ message: "Batches assigned successfully", batchIds });
});

export const deleteBatchAndStudents = asyncHandler(async (req, res) => {
  const { batchId } = req.body;

  if (!batchId || !batchId.match(/^[0-9a-fA-F]{24}$/)) {
    return res.status(400).json({ message: "Invalid batchId" });
  }

  await StudentBatchMapping.deleteMany({ batchId });

  await Student.updateMany(
    { batchIds: batchId },
    { $pull: { batchIds: batchId } }
  );

  const batchResourceMappings = await BRM.find({ batchId });
  const resourceIds = batchResourceMappings.map(m => m.resId);

  await Resource.updateMany(
    { _id: { $in: resourceIds } },
    { $pull: { batchIds: batchId } }
  );

  const resources = await Resource.find({ _id: { $in: resourceIds } });
  for (const resource of resources) {
    if (!resource.batchIds || resource.batchIds.length === 0) {
      if (resource.s3Key) {
        try {
          await deleteFileFromS3(resource.s3Key);
        } catch (err) {
          console.error(`Failed to delete S3 file for resource ${resource._id}:`, err);
        }
      }
      await resource.deleteOne();
    }
  }

  await BRM.deleteMany({ batchId });

  await Batch.findByIdAndDelete(batchId);

  res.json({ message: "Batch deleted, students and resources unlinked, resources deleted from S3 if not mapped to any batch." });
});

export const deleteResource = asyncHandler(async (req, res) => {
  const { resourceId } = req.body;

  if (!resourceId || !resourceId.match(/^[0-9a-fA-F]{24}$/)) {
    return res.status(400).json({ message: "Invalid resourceId" });
  }

  const resource = await Resource.findByIdAndDelete(resourceId);
  if (!resource) {
    return res.status(404).json({ message: "Resource not found" });
  }

  if (resource.s3Key) {
    try {
      await deleteFileFromS3(resource.s3Key);
    } catch (err) {
      console.error("Failed to delete file from S3:", err);
    }
  }

  res.json({ message: "Resource deleted successfully" });
});