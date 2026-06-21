import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export function getStorageClient() {
  return new S3Client({
    region: process.env.S3_REGION || "auto",
    endpoint: process.env.S3_ENDPOINT,
    credentials:
      process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
        ? {
            accessKeyId: process.env.S3_ACCESS_KEY_ID,
            secretAccessKey: process.env.S3_SECRET_ACCESS_KEY
          }
        : undefined,
    forcePathStyle: Boolean(process.env.S3_ENDPOINT)
  });
}

export async function createUploadUrl(input: { key: string; mimeType: string }) {
  const bucket = process.env.S3_BUCKET;
  if (!bucket) {
    throw new Error("S3_BUCKET is required");
  }

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: input.key,
    ContentType: input.mimeType
  });

  const url = await getSignedUrl(getStorageClient(), command, { expiresIn: 60 * 10 });
  return { bucket, key: input.key, url };
}
