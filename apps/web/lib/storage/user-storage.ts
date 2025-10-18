import { hash, compare } from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import type { User } from "@/types/storage";
import { atomicWriteJSON, readJSON, exists } from "./file-system";
import { PATHS } from "./init";
import { NotFoundError, ConflictError, ValidationError } from "./errors";

export class UserStorage {
  /**
   * 读取所有用户
   */
  private async readUsers(): Promise<User[]> {
    if (!exists(PATHS.USERS_FILE)) {
      return [];
    }
    return await readJSON<User[]>(PATHS.USERS_FILE);
  }

  /**
   * 写入所有用户
   */
  private async writeUsers(users: User[]): Promise<void> {
    await atomicWriteJSON(PATHS.USERS_FILE, users);
  }

  /**
   * 创建新用户
   */
  async create(
    email: string,
    password: string,
    name?: string
  ): Promise<Omit<User, "passwordHash">> {
    // 验证输入
    if (!email || !password) {
      throw new ValidationError("Email and password are required");
    }

    if (password.length < 6) {
      throw new ValidationError("Password must be at least 6 characters");
    }

    const users = await this.readUsers();

    // 检查邮箱是否已存在
    const existing = users.find((u) => u.email === email);
    if (existing) {
      throw new ConflictError("Email already exists");
    }

    // 加密密码
    const passwordHash = await hash(password, 10);

    // 创建用户对象
    const user: User = {
      id: uuidv4(),
      email,
      passwordHash,
      name,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // 添加到列表并保存
    users.push(user);
    await this.writeUsers(users);

    // 返回时移除密码哈希
    const { passwordHash: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  /**
   * 根据邮箱查找用户
   */
  async findByEmail(email: string): Promise<User | null> {
    const users = await this.readUsers();
    return users.find((u) => u.email === email) || null;
  }

  /**
   * 根据 ID 查找用户
   */
  async findById(id: string): Promise<Omit<User, "passwordHash"> | null> {
    const users = await this.readUsers();
    const user = users.find((u) => u.id === id);

    if (!user) {
      return null;
    }

    const { passwordHash: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  /**
   * 验证用户密码
   */
  async verifyPassword(email: string, password: string): Promise<User | null> {
    const user = await this.findByEmail(email);
    if (!user) {
      return null;
    }

    const isValid = await compare(password, user.passwordHash);
    if (!isValid) {
      return null;
    }

    return user;
  }

  /**
   * 更新用户信息
   */
  async update(
    id: string,
    data: Partial<Omit<User, "id" | "passwordHash" | "createdAt">>
  ): Promise<Omit<User, "passwordHash">> {
    const users = await this.readUsers();
    const index = users.findIndex((u) => u.id === id);

    if (index === -1) {
      throw new NotFoundError("User");
    }

    // 更新用户
    users[index] = {
      ...users[index],
      ...data,
      updatedAt: new Date().toISOString(),
    };

    await this.writeUsers(users);

    const { passwordHash: _, ...userWithoutPassword } = users[index];
    return userWithoutPassword;
  }
}

// 导出单例
export const userStorage = new UserStorage();
