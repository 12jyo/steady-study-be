import mongoose from "mongoose";

const sbmSchema = new mongoose.Schema(
  {
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true },
    batchId: { type: mongoose.Schema.Types.ObjectId, ref: "Batch", required: true }
  },
  { timestamps: true }
);

sbmSchema.index({ studentId: 1, batchId: 1 }, { unique: true });

export default mongoose.model("StudentBatchMapping", sbmSchema);
