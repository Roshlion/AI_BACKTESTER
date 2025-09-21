// lib/s3-manager.ts
import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import fs from 'fs-extra';
import path from 'path';

export class S3Manager {
  private s3Client: S3Client;
  private bucketName: string;

  constructor(bucketName: string, region = 'us-east-1') {
    this.bucketName = bucketName;
    this.s3Client = new S3Client({ 
      region,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      }
    });
  }

  // Upload file to S3
  async uploadFile(localFilePath: string, s3Key: string): Promise<void> {
    try {
      const fileContent = await fs.readFile(localFilePath);
      
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: s3Key,
        Body: fileContent,
        ContentType: s3Key.endsWith('.parquet') ? 'application/octet-stream' : 'application/json',
      });

      await this.s3Client.send(command);
      console.log(`Uploaded ${localFilePath} to s3://${this.bucketName}/${s3Key}`);
    } catch (error) {
      console.error(`Error uploading ${localFilePath}:`, error);
      throw error;
    }
  }

  // Download file from S3
  async downloadFile(s3Key: string, localFilePath: string): Promise<void> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: s3Key,
      });

      const response = await this.s3Client.send(command);
      
      if (response.Body) {
        const chunks: Uint8Array[] = [];
        const reader = response.Body.transformToWebStream().getReader();
        
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
        }
        
        const buffer = Buffer.concat(chunks);
        await fs.ensureDir(path.dirname(localFilePath));
        await fs.writeFile(localFilePath, buffer);
        
        console.log(`Downloaded s3://${this.bucketName}/${s3Key} to ${localFilePath}`);
      }
    } catch (error) {
      console.error(`Error downloading ${s3Key}:`, error);
      throw error;
    }
  }

  // List files in S3 bucket
  async listFiles(prefix?: string): Promise<string[]> {
    try {
      const command = new ListObjectsV2Command({
        Bucket: this.bucketName,
        Prefix: prefix,
      });

      const response = await this.s3Client.send(command);
      return response.Contents?.map(obj => obj.Key!).filter(Boolean) || [];
    } catch (error) {
      console.error('Error listing S3 files:', error);
      return [];
    }
  }

  // Check if file exists in S3
  async fileExists(s3Key: string): Promise<boolean> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: s3Key,
      });

      await this.s3Client.send(command);
      return true;
    } catch (error) {
      return false;
    }
  }
}
