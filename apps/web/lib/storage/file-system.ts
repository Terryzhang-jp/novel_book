import { writeFile, readFile, rename, unlink, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join, normalize, relative } from "path";

/**
 * 原子性写入 JSON 文件
 * 使用临时文件 + rename 保证原子性
 */
export async function atomicWriteJSON(
  filepath: string,
  data: unknown
): Promise<void> {
  const tmpPath = `${filepath}.tmp`;

  try {
    // 1. 写入临时文件
    const jsonString = JSON.stringify(data, null, 2);
    await writeFile(tmpPath, jsonString, "utf-8");

    // 2. 验证数据有效性
    const written = await readFile(tmpPath, "utf-8");
    JSON.parse(written); // 验证 JSON 格式

    // 3. 原子性替换（POSIX 保证）
    await rename(tmpPath, filepath);
  } catch (error) {
    // 清理临时文件
    if (existsSync(tmpPath)) {
      await unlink(tmpPath).catch(() => {});
    }
    throw error;
  }
}

/**
 * 读取 JSON 文件
 */
export async function readJSON<T>(filepath: string): Promise<T> {
  const content = await readFile(filepath, "utf-8");
  return JSON.parse(content) as T;
}

/**
 * 检查文件是否存在
 */
export function exists(filepath: string): boolean {
  return existsSync(filepath);
}

/**
 * 安全的路径拼接（防止路径遍历攻击）
 */
export function safeJoin(base: string, ...paths: string[]): string {
  const result = normalize(join(base, ...paths));
  const rel = relative(base, result);

  // 如果相对路径以 .. 开头，说明试图访问父目录
  if (rel.startsWith("..") || rel.startsWith("/")) {
    throw new Error("Path traversal detected");
  }

  return result;
}

/**
 * 确保目录存在
 */
export async function ensureDir(dirPath: string): Promise<void> {
  if (!existsSync(dirPath)) {
    await mkdir(dirPath, { recursive: true });
  }
}

/**
 * 删除文件（如果存在）
 */
export async function deleteFile(filepath: string): Promise<void> {
  if (exists(filepath)) {
    await unlink(filepath);
  }
}
