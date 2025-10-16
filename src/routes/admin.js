import express from "express";
import multer from "multer";
import authAdmin from "../middleware/authAdmin.js";
import {
  adminLogin, adminLogout,
  enrollStudent, setStudentPassword, setStudentDeviceLimit, addStudentToBatch,
  createBatch, listBatches,
  uploadResourceToBatch, listResourcesByBatch,
  listStudentsByBatch,
  listAllStudents,
  resetStudentPassword,
  assignBatchesToStudent,
  deleteBatchAndStudents,
  deleteResource
} from "../controllers/adminController.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post("/login", adminLogin);
router.post("/logout", authAdmin, adminLogout);

router.post("/enroll-student", authAdmin, enrollStudent);
router.put("/set-student-password", authAdmin, setStudentPassword);
router.put("/set-student-device-limit", authAdmin, setStudentDeviceLimit);
router.post("/add-student-to-batch", authAdmin, addStudentToBatch);

router.post("/create-batch", authAdmin, createBatch);
router.get("/batches", authAdmin, listBatches);

router.get("/students", authAdmin, listAllStudents);

router.get("/students-by-batch", authAdmin, listStudentsByBatch);


router.post("/upload", authAdmin, upload.single("file"), uploadResourceToBatch);
router.get("/resources", authAdmin, listResourcesByBatch);

router.put("/reset-password", authAdmin, resetStudentPassword);

router.put("/set-student-device-limit", authAdmin, setStudentDeviceLimit);

router.put("/assign-batches", authAdmin, assignBatchesToStudent);

router.delete("/delete-batch", authAdmin, deleteBatchAndStudents);

router.delete("/delete-resource", authAdmin, deleteResource);

export default router;
