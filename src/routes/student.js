import express from "express";
import authStudent from "../middleware/authStudent.js";
import {
  studentLogin, studentLogout,
  changePassword,
  listMyResources, getResourceSigned,
  getResourceFile,
} from "../controllers/studentController.js";

const router = express.Router();

router.post("/login", studentLogin);
router.post("/logout", authStudent, studentLogout);

router.put("/change-password", authStudent, changePassword);

router.get("/resources", authStudent, listMyResources);
router.get("/resource-encrypted/:resource_id", authStudent, getResourceSigned);

router.get("/resource/:id/file", authStudent, getResourceFile);

export default router;
