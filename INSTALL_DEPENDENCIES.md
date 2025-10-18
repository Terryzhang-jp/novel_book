# 地点库功能依赖安装

## 需要安装的npm包

在继续之前,请在 `apps/web` 目录下安装以下依赖:

```bash
cd apps/web

# 安装地图相关依赖
pnpm add react-leaflet leaflet

# 安装类型定义
pnpm add -D @types/leaflet

# 安装拖拽功能依赖 (Phase 10需要)
pnpm add react-dnd react-dnd-html5-backend
pnpm add -D @types/react-dnd
```

## 安装命令(一键复制)

```bash
cd apps/web && pnpm add react-leaflet leaflet react-dnd react-dnd-html5-backend && pnpm add -D @types/leaflet @types/react-dnd
```

## 验证安装

安装完成后,请运行:

```bash
pnpm typecheck
```

确保没有类型错误。

## 说明

- **react-leaflet**: React包装器,用于Leaflet地图库
- **leaflet**: 开源地图库,配合OpenStreetMap使用
- **react-dnd**: 拖拽库,用于批量分配地点功能
- **react-dnd-html5-backend**: HTML5拖拽后端

这些依赖都是必需的,因为:
1. Leaflet用于地图显示和交互
2. react-dnd用于实现照片批量拖拽到地点的功能
