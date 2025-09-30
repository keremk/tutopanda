import { resolve } from "node:path";
import { FileStorage } from "@flystorage/file-storage";
import { LocalStorageAdapter } from "@flystorage/local-fs";

export const setupFileStorage = () => {
  const rootDirectory = resolve(process.cwd(), "local-storage");
  const adapter = new LocalStorageAdapter(rootDirectory);
  return new FileStorage(adapter);
};

export const saveFileToStorage = async (
  storage: FileStorage,
  file: Buffer | Uint8Array,
  filePath: string
): Promise<string> => {
  await storage.write(filePath, file);
  return filePath;
};