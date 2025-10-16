import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import mime from "mime-types";

const s3 = new S3Client({ region: process.env.AWS_REGION });

export const uploadBufferToS3 = async (buffer, key, filename) => {
  const bucket = process.env.S3_BUCKET;
  const contentType = mime.lookup(filename) || "application/octet-stream";

  await s3.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: buffer,
    ContentType: contentType
  }));

  return { bucket, key };
};

export const getSignedReadUrl = async (key, ttlSec = 60 * 5) => {
  const bucket = process.env.S3_BUCKET;
  const cmd = new GetObjectCommand({ Bucket: bucket, Key: key });
  return getSignedUrl(s3, cmd, { expiresIn: ttlSec });
};

export async function deleteFileFromS3(key) {
  const params = {
    Bucket: process.env.AWS_BUCKET,
    Key: key,
  };
  await s3.send(new DeleteObjectCommand(params));
}