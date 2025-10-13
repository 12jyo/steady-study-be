import mongoose from "mongoose";

const BatchResourceMappingSchema = new mongoose.Schema({
  batchId: { type: mongoose.Schema.Types.ObjectId, ref: "Batch", required: true },
  resId: { type: mongoose.Schema.Types.ObjectId, ref: "Resource", required: true },
}, { timestamps: true });

export default mongoose.model("BatchResourceMapping", BatchResourceMappingSchema, "batch_resource_mappings");