import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";
import { randomUUID } from "crypto";

type ServiceAccountConfig = {
  projectId: string;
  clientEmail: string;
  privateKey: string;
};

function getProjectId() {
  const projectId =
    process.env.FIREBASE_PROJECT_ID ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCLOUD_PROJECT ||
    process.env.GOOGLE_DRIVE_CLIENT_EMAIL?.split("@")[1]?.split(".")[0];

  if (!projectId) {
    throw new Error("Missing FIREBASE_PROJECT_ID");
  }

  return projectId;
}

function getServiceAccountConfig(): ServiceAccountConfig {
  const projectId = getProjectId();
  const clientEmail =
    process.env.FIREBASE_CLIENT_EMAIL || process.env.GOOGLE_DRIVE_CLIENT_EMAIL;
  const privateKey = (
    process.env.FIREBASE_PRIVATE_KEY || process.env.GOOGLE_DRIVE_PRIVATE_KEY
  )?.replace(/\\n/g, "\n");

  if (!clientEmail || !privateKey) {
    throw new Error("Missing Firebase service account credentials");
  }

  return { projectId, clientEmail, privateKey };
}

function getBucketName(projectId: string) {
  return (
    process.env.FIREBASE_STORAGE_BUCKET || `${projectId}.firebasestorage.app`
  );
}

function normalizeStoragePath(fileName: string, folderPath?: string) {
  const normalizedFolder = folderPath
    ?.replace(/^gs:\/\/[^/]+\//, "")
    .replace(/^\/+|\/+$/g, "");
  const normalizedFileName = fileName.replace(/^\/+/g, "");

  return [normalizedFolder, normalizedFileName].filter(Boolean).join("/");
}

function toFirebaseDownloadUrl(bucketName: string, filePath: string, token: string) {
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(
    filePath,
  )}?alt=media&token=${token}`;
}

function extractStoragePath(fileUrlOrPath: string, bucketName: string) {
  if (!fileUrlOrPath) return null;

  if (fileUrlOrPath.startsWith("gs://")) {
    const withoutScheme = fileUrlOrPath.slice("gs://".length);
    const slashIndex = withoutScheme.indexOf("/");
    return slashIndex === -1 ? null : withoutScheme.slice(slashIndex + 1);
  }

  try {
    const url = new URL(fileUrlOrPath);

    if (url.hostname === "firebasestorage.googleapis.com") {
      const match = url.pathname.match(/\/o\/(.+)$/);
      return match ? decodeURIComponent(match[1]) : null;
    }

    if (url.hostname === "storage.googleapis.com") {
      const pathParts = url.pathname.split("/").filter(Boolean);
      if (pathParts[0] === bucketName) {
        return decodeURIComponent(pathParts.slice(1).join("/"));
      }
    }
  } catch {
    return fileUrlOrPath.replace(/^\/+/, "");
  }

  return null;
}

export class FirebaseStorageService {
  private bucketName: string;

  constructor() {
    const serviceAccount = getServiceAccountConfig();
    this.bucketName = getBucketName(serviceAccount.projectId);

    if (!getApps().length) {
      initializeApp({
        credential: cert(serviceAccount),
        storageBucket: this.bucketName,
      });
    }
  }

  async uploadFile(
    file: File,
    fileName: string,
    mimeType: string,
    folderPath?: string,
  ): Promise<string> {
    try {
      const storagePath = normalizeStoragePath(fileName, folderPath);
      const token = randomUUID();
      const buffer = Buffer.from(await file.arrayBuffer());
      const storageFile = getStorage().bucket(this.bucketName).file(storagePath);

      await storageFile.save(buffer, {
        metadata: {
          contentType: mimeType,
          cacheControl: "public, max-age=31536000",
          metadata: {
            firebaseStorageDownloadTokens: token,
          },
        },
      });

      return toFirebaseDownloadUrl(this.bucketName, storagePath, token);
    } catch (error) {
      console.error("Error uploading to Firebase Storage:", error);
      throw new Error("Failed to upload file to Firebase Storage");
    }
  }

  async deleteFile(fileUrlOrPath: string): Promise<void> {
    try {
      const storagePath = extractStoragePath(fileUrlOrPath, this.bucketName);

      if (!storagePath) {
        throw new Error("Could not determine Firebase Storage file path");
      }

      await getStorage().bucket(this.bucketName).file(storagePath).delete({
        ignoreNotFound: true,
      });
    } catch (error) {
      console.error("Error deleting from Firebase Storage:", error);
      throw new Error("Failed to delete file from Firebase Storage");
    }
  }
}

export const firebaseStorageService = new FirebaseStorageService();
