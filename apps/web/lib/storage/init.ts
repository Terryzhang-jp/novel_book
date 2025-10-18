import { join } from "path";
import { ensureDir, exists, atomicWriteJSON } from "./file-system";

/**
 * 获取数据根目录
 */
export function getDataRoot(): string {
  return join(process.cwd(), "data");
}

/**
 * 获取各个子目录路径
 */
export const PATHS = {
  DATA_ROOT: getDataRoot(),
  AUTH: join(getDataRoot(), "auth"),
  DOCUMENTS: join(getDataRoot(), "documents"),
  PHOTOS: join(getDataRoot(), "photos"),
  LOCATIONS: join(getDataRoot(), "locations"),
  INDEXES: join(getDataRoot(), "indexes"),
  IMAGES: join(process.cwd(), "public", "images"),

  // 文件路径
  USERS_FILE: join(getDataRoot(), "auth", "users.json"),
};

/**
 * 初始化存储目录结构
 */
export async function initializeStorage(): Promise<void> {
  console.log("Initializing storage directories...");

  // 创建所有必要的目录
  await ensureDir(PATHS.DATA_ROOT);
  await ensureDir(PATHS.AUTH);
  await ensureDir(PATHS.DOCUMENTS);
  await ensureDir(PATHS.PHOTOS);
  await ensureDir(PATHS.LOCATIONS);
  await ensureDir(PATHS.INDEXES);
  await ensureDir(PATHS.IMAGES);

  // 如果 users.json 不存在，创建空数组
  if (!exists(PATHS.USERS_FILE)) {
    await atomicWriteJSON(PATHS.USERS_FILE, []);
    console.log("Created users.json");
  }

  console.log("Storage initialization complete");
  console.log("Data directory:", PATHS.DATA_ROOT);
}
