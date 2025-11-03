import { hash, compare } from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import type { User } from "@/types/storage";
import { NotFoundError, ConflictError, ValidationError } from "./errors";
import { supabaseAdmin } from "@/lib/supabase/admin";

export class UserStorage {
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

    // 检查邮箱是否已存在
    const { data: existing } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('email', email)
      .single();

    if (existing) {
      throw new ConflictError("Email already exists");
    }

    // 加密密码
    const passwordHash = await hash(password, 10);

    // 创建用户对象
    const userId = uuidv4();
    const now = new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from('users')
      .insert({
        id: userId,
        email,
        password_hash: passwordHash,
        name,
        profile: {},
        created_at: now,
        updated_at: now,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create user: ${error.message}`);
    }

    // 返回时移除密码哈希
    return {
      id: data.id,
      email: data.email,
      name: data.name,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }

  /**
   * 根据邮箱查找用户
   */
  async findByEmail(email: string): Promise<User | null> {
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (error || !data) {
      return null;
    }

    return {
      id: data.id,
      email: data.email,
      passwordHash: data.password_hash,
      name: data.name,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }

  /**
   * 根据 ID 查找用户
   */
  async findById(id: string): Promise<Omit<User, "passwordHash"> | null> {
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('id, email, name, created_at, updated_at')
      .eq('id', id)
      .single();

    if (error || !data) {
      return null;
    }

    return {
      id: data.id,
      email: data.email,
      name: data.name,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
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
    const { data: updated, error } = await supabaseAdmin
      .from('users')
      .update({
        name: data.name,
        email: data.email,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('id, email, name, created_at, updated_at')
      .single();

    if (error) {
      throw new NotFoundError("User");
    }

    return {
      id: updated.id,
      email: updated.email,
      name: updated.name,
      createdAt: updated.created_at,
      updatedAt: updated.updated_at,
    };
  }

  /**
   * 获取所有用户（用于公共 API JOIN 操作）
   * 返回不包含密码哈希的用户列表
   */
  async findAll(): Promise<Omit<User, "passwordHash">[]> {
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('id, email, name, created_at, updated_at');

    if (error) {
      return [];
    }

    return data.map(user => ({
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.created_at,
      updatedAt: user.updated_at,
    }));
  }
}

// 导出单例
export const userStorage = new UserStorage();
