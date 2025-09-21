declare module "@aws-sdk/client-s3" {
  export class S3Client {
    constructor(config?: any);
    send(command: any): Promise<any>;
  }
  export class PutObjectCommand {
    constructor(params: any);
  }
  export class GetObjectCommand {
    constructor(params: any);
  }
  export class ListObjectsV2Command {
    constructor(params: any);
  }
}