import mongoose from "mongoose";

const BatchSchema = new mongoose.Schema({
  title: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
}, { timestamps: true });

export default mongoose.model("Batch", BatchSchema, "batches");