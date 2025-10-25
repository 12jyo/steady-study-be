import mongoose from "mongoose";

const StudentSchema = new mongoose.Schema({
  name: { type: String, required: false },
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  activeDevices: { type: [String], default: [] },
  deviceLimit: { type: Number, default: 2 },
  batchIds: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Batch",
    },
  ],
}, { timestamps: true });

export default mongoose.model("Student", StudentSchema, "students");