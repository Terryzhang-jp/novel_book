# Chichibu Public Map - Implementation Strategy

## 目标

创建一个公共的秩父旅行地图页面 (`/chichibu`)，展示所有用户上传的照片，包括位置、描述和上传者信息。

## 需求确认

### 功能需求
- ✅ 所有用户的照片公开可见（暂时全部公开，后期可添加隐私控制）
- ✅ 这是一个旅行分享应用
- ✅ 照片描述/日记内容公开显示
- ✅ 显示上传者真实姓名 (`user.name`)
- ✅ 路由：`/chichibu`
- ✅ 无需登录即可访问

### 技术需求
- 地图默认中心在秩父（已完成 ✓）
- 复用现有 PhotoMap 组件
- 新建公共API返回所有用户照片
- JOIN 用户信息显示上传者姓名
- 只读模式（无编辑功能）

## 架构方案：混合方案（Phase 1）

### 为什么选择这个方案？

**初期（现在）：**
- 用户数量少（<10人），文件扫描性能可接受
- 快速实现，验证产品方向
- 避免过度设计

**后期（用户增多后）：**
- 可迁移到全局索引
- API接口保持不变，只优化内部实现

## 数据结构设计

### 1. 扩展 Photo 类型
```typescript
interface Photo {
  // ... 现有字段
  isPublic?: boolean;  // 是否公开（默认 true）
}
```

### 2. 新增 PublicPhotoData 类型（API返回）
```typescript
interface PublicPhotoData {
  // 照片基本信息
  id: string;
  userId: string;
  fileName: string;
  category: PhotoCategory;

  // 元数据
  metadata: {
    dateTime?: string;
    location?: {
      latitude: number;
      longitude: number;
    };
    camera?: {
      make?: string;
      model?: string;
    };
    fileSize?: number;
    dimensions?: { width: number; height: number };
  };

  // 描述（日记内容）
  description?: JSONContent;

  // 上传者信息
  userName: string;  // 用户真实姓名
  userEmail?: string;  // 可选：用于头像生成

  // 时间戳
  createdAt: string;
  updatedAt: string;
}
```

## 实施步骤

### Phase 1: 后端 API（约30分钟）

#### Step 1.1: 扩展 Photo 类型
**文件：** `apps/web/types/storage.ts`

```typescript
export interface Photo {
  // ... 现有字段
  isPublic?: boolean;  // 新增：是否公开（默认 true）
}
```

#### Step 1.2: 创建公共照片API
**文件：** `apps/web/app/api/public/photos/route.ts`（新建）

**功能：**
- 无需认证（公开访问）
- 扫描 `data/photos/*.json` 获取所有照片
- 过滤：只返回 `isPublic !== false` 的照片
- JOIN 用户信息（从 `data/auth/users.json`）
- 只返回有位置信息的照片（用于地图展示）

**伪代码：**
```typescript
export async function GET(req: Request) {
  // 1. 读取所有照片文件
  const allPhotos = scanPhotosDirectory();

  // 2. 过滤：只要公开的 + 有位置的
  const publicPhotos = allPhotos.filter(photo =>
    photo.isPublic !== false &&
    photo.metadata?.location
  );

  // 3. JOIN 用户信息
  const users = readUsersFile();
  const photosWithUserInfo = publicPhotos.map(photo => ({
    ...photo,
    userName: users.find(u => u.id === photo.userId)?.name || 'Anonymous',
  }));

  // 4. 返回数据
  return NextResponse.json({ photos: photosWithUserInfo });
}
```

#### Step 1.3: 实现照片扫描工具函数
**文件：** `apps/web/lib/storage/photo-storage.ts`

新增方法：
```typescript
/**
 * 获取所有公开的照片（用于公共地图）
 * 不需要 userId，返回所有用户的公开照片
 */
async getAllPublicPhotos(): Promise<Photo[]> {
  // 扫描 data/photos/ 目录
  // 过滤 isPublic !== false
  // 返回完整 Photo 对象
}
```

### Phase 2: 前端页面（约45分钟）

#### Step 2.1: 修改 Middleware 允许公开访问
**文件：** `apps/web/middleware.ts`

```typescript
// Public routes (不需要认证)
const publicRoutes = ["/login", "/register", "/chichibu"];  // 添加 /chichibu
```

#### Step 2.2: 创建 Chichibu 公共页面
**文件：** `apps/web/app/chichibu/page.tsx`（新建）

**布局：**
```
┌─────────────────────────────────────┐
│  Hero Section                       │
│  - 标题："Chichibu Travel"         │
│  - 统计：X张照片，Y位旅行者        │
└─────────────────────────────────────┘
┌─────────────────────────────────────┐
│  Interactive Map                    │
│  - 地图中心：秩父                  │
│  - 显示所有公开照片的 pins         │
│  - 点击 pin → 打开详情 modal       │
└─────────────────────────────────────┘
```

**功能：**
- 无需登录即可访问
- 调用 `GET /api/public/photos`
- 复用 `PhotoMap` 组件
- 点击照片打开 `PublicPhotoDetailModal`

#### Step 2.3: 创建公共照片详情 Modal
**文件：** `apps/web/components/photos/public-photo-detail-modal.tsx`（新建）

**与 PhotoDetailModal 的区别：**
- ✅ 显示上传者信息（姓名）
- ✅ 显示完整描述（Novel 格式渲染）
- ❌ 无编辑功能（只读）
- ❌ 无 LocationAssignment 组件
- ❌ 无删除按钮

**UI 元素：**
```
┌──────────────────────────────────────┐
│  [关闭 X]                            │
│                                      │
│  ┌────────────┐  ┌────────────────┐ │
│  │            │  │ 上传者：张三   │ │
│  │   Photo    │  │ 📅 2024-10-18  │ │
│  │            │  │ 📍 秩父         │ │
│  │            │  │                │ │
│  └────────────┘  │ 📝 描述：       │ │
│                  │ (Novel 渲染)   │ │
│                  │                │ │
│                  └────────────────┘ │
└──────────────────────────────────────┘
```

#### Step 2.4: 调整 PhotoMap 组件支持公共数据
**文件：** `apps/web/components/maps/photo-map.tsx`

**可能需要的调整：**
- 检查 props 是否需要扩展（传入 userName）
- 确保 popup 可以显示用户信息

### Phase 3: 数据初始化（约15分钟）

#### Step 3.1: 现有照片添加默认 isPublic
**策略：**
- 所有现有照片默认 `isPublic = true`（向后兼容）
- 新上传照片默认 `isPublic = true`
- 未来可添加设置界面

**修改：**
```typescript
// photo-storage.ts - create() 方法
const photo: Photo = {
  // ... 现有字段
  isPublic: true,  // 新增默认值
};
```

### Phase 4: 测试（约30分钟）

#### 测试清单
- [ ] `/chichibu` 页面无需登录即可访问
- [ ] 显示所有用户的照片 pins
- [ ] 点击 pin 打开详情 modal
- [ ] 显示正确的用户姓名
- [ ] 显示完整的照片描述（Novel 格式）
- [ ] 地图默认中心在秩父
- [ ] 无编辑按钮（只读模式）
- [ ] 现有用户功能不受影响（`/gallery/*` 正常）

## 技术细节

### 1. 照片扫描性能优化

**初期（MVP）：**
```typescript
// 简单扫描，无缓存
async getAllPublicPhotos() {
  const files = fs.readdirSync('data/photos/');
  const photos = files.map(f => readJSON(f));
  return photos.filter(p => p.isPublic !== false);
}
```

**后期优化（可选）：**
```typescript
// 添加内存缓存（5分钟）
const cache = { data: null, timestamp: 0 };
async getAllPublicPhotos() {
  const now = Date.now();
  if (cache.data && now - cache.timestamp < 5 * 60 * 1000) {
    return cache.data;
  }

  const photos = scanPhotos();
  cache.data = photos;
  cache.timestamp = now;
  return photos;
}
```

### 2. 用户信息 JOIN

```typescript
// 读取用户列表
const users = await userStorage.readUsers();
const userMap = new Map(users.map(u => [u.id, u]));

// JOIN 操作
const photosWithUserInfo = photos.map(photo => ({
  ...photo,
  userName: userMap.get(photo.userId)?.name || 'Anonymous',
}));
```

### 3. Novel 描述渲染

复用现有的渲染逻辑：
```typescript
import { extractTextFromJSON, isJSONContentEmpty } from '@/lib/utils/json-content';

// 在 modal 中显示
{!isJSONContentEmpty(photo.description) && (
  <div className="prose prose-sm">
    {/* 使用 Novel 的只读渲染器 */}
    <EditorContent
      initialContent={photo.description}
      editable={false}
    />
  </div>
)}
```

## 潜在问题与解决方案

### 问题 1: 性能（用户增多后）
**症状：** 照片数量>1000时，扫描变慢
**解决：** 迁移到全局索引（Phase 2）

### 问题 2: 照片路径访问
**症状：** 公开页面无法访问 `/images/{userId}/gallery/`
**检查：** middleware 已配置允许访问 `/images/*`
**确认：** `matcher` 排除了 `images` 路径 ✓

### 问题 3: 用户删除账户后的照片
**症状：** 用户信息找不到，显示 "Anonymous"
**方案：** 可接受（软删除策略）

## 文件清单

### 新建文件
```
apps/web/
├── app/
│   ├── chichibu/
│   │   └── page.tsx                    # 公共地图页面
│   └── api/
│       └── public/
│           └── photos/
│               └── route.ts            # 公共照片API
└── components/
    └── photos/
        └── public-photo-detail-modal.tsx  # 公共照片详情modal
```

### 修改文件
```
apps/web/
├── types/
│   └── storage.ts                      # 添加 isPublic 字段
├── lib/storage/
│   └── photo-storage.ts                # 添加 getAllPublicPhotos()
├── middleware.ts                       # 允许 /chichibu 公开访问
└── components/maps/
    └── photo-map.tsx                   # 可能需要小调整（显示用户信息）
```

## 时间估算

| 任务 | 时间 |
|------|------|
| 扩展类型定义 | 5分钟 |
| 实现 getAllPublicPhotos() | 15分钟 |
| 创建公共API | 15分钟 |
| 修改 middleware | 5分钟 |
| 创建 /chichibu 页面 | 20分钟 |
| 创建公共 Modal 组件 | 25分钟 |
| 测试与调试 | 30分钟 |
| **总计** | **约 2 小时** |

## 后续扩展（Phase 2 - 可选）

### 1. 隐私控制
- 照片设置界面（公开/私密切换）
- 更新 `PUT /api/photos/[id]` 支持修改 `isPublic`

### 2. 全局索引
- 创建 `data/indexes/public.json`
- 照片 CRUD 时同步更新全局索引
- 优化查询性能

### 3. 社交功能
- 点赞/收藏
- 评论系统
- 用户主页

### 4. UI 增强
- Hero section 设计
- 时间轴筛选
- 用户筛选器
- 瀑布流/网格视图切换

## 开始实施

按照以下顺序执行：
1. ✅ 扩展 Photo 类型（`types/storage.ts`）
2. ✅ 实现照片扫描（`photo-storage.ts`）
3. ✅ 创建公共API（`app/api/public/photos/route.ts`）
4. ✅ 修改 middleware（`middleware.ts`）
5. ✅ 创建公共 Modal（`components/photos/public-photo-detail-modal.tsx`）
6. ✅ 创建公共页面（`app/chichibu/page.tsx`）
7. ✅ 测试验证

---

**状态：** 准备开始实施
**最后更新：** 2025-10-19
