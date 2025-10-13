import mongoose from "mongoose";

const ResourceSchema = new mongoose.Schema({
  title: { type: String, required: true },
  s3Key: { type: String, required: true },
}, { timestamps: true });

export default mongoose.model("Resource", ResourceSchema, "resources");