function req(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(Missing env );
  }
  return value;
}

export const AWS_BUCKET = req("AWS_BUCKET");
export const AWS_REGION = process.env.AWS_REGION || "us-east-1";
export const AWS_PREFIX = process.env.AWS_PREFIX || "prod";

export const S3_BASE = process.env.S3_BASE || https://.s3.amazonaws.com/;
