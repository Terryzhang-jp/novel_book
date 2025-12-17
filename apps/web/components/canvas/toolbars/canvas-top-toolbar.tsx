/**
 * CanvasTopToolbar Component
 *
 * Main toolbar at the top of the canvas with warm, inviting design.
 * Features gradient buttons, smooth animations, and clear visual hierarchy.
 */

"use client";

import { memo } from "react";
import {
  Image as ImageIcon,
  Type,
  X,
  Smile,
  Sparkles,
  Loader2,
  Cloud,
  CloudOff,
  MousePointer,
  Hand,
  Undo,
  Redo,
  Images,
  CircleDot,
  ArrowLeft,
} from "lucide-react";
import { useCanvasStore } from "@/lib/canvas/canvas-store";
import type { CanvasToolType } from "@/types/storage";

interface CanvasTopToolbarProps {
  onAddPhoto: () => void;
  onAddText: () => void;
  onToggleStickerPicker: () => void;
  onOpenAiMagic: () => void;
  visible: boolean;
}

function CanvasTopToolbarComponent({
  onAddPhoto,
  onAddText,
  onToggleStickerPicker,
  onOpenAiMagic,
  visible,
}: CanvasTopToolbarProps) {
  const {
    tool,
    setTool,
    showGrid,
    toggleGrid,
    showStickerPicker,
    showPhotoSidebar,
    setShowPhotoSidebar,
    saveStatus,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useCanvasStore();

  const handleToolChange = (newTool: CanvasToolType) => {
    setTool(newTool);
  };

  return (
    <div
      className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 transition-all duration-500 ${
        visible
          ? "opacity-100 translate-y-0"
          : "opacity-0 -translate-y-6 pointer-events-none"
      }`}
    >
      <div className="bg-white/90 backdrop-blur-xl rounded-2xl shadow-lg px-4 py-2.5 flex items-center gap-2 border border-amber-100/60">
        {/* 返回按钮 */}
        <button
          onClick={() => window.history.back()}
          className="p-2 hover:bg-gray-100 rounded-xl transition-all duration-200 text-gray-500 hover:text-gray-700"
          title="返回"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <Divider />

        {/* 保存状态 */}
        <SaveStatusIndicator status={saveStatus} />

        <Divider />

        {/* Undo/Redo */}
        <div className="flex items-center gap-0.5">
          <IconButton
            icon={<Undo className="w-4 h-4" />}
            onClick={undo}
            disabled={!canUndo()}
            title="撤销 (Ctrl+Z)"
          />
          <IconButton
            icon={<Redo className="w-4 h-4" />}
            onClick={redo}
            disabled={!canRedo()}
            title="重做 (Ctrl+Shift+Z)"
          />
        </div>

        <Divider />

        {/* 工具选择 */}
        <div className="flex items-center gap-0.5 bg-gray-100/80 rounded-xl p-1">
          <ToolButton
            icon={<MousePointer className="w-4 h-4" />}
            active={tool === "select"}
            onClick={() => handleToolChange("select")}
            title="选择 (V)"
          />
          <ToolButton
            icon={<Hand className="w-4 h-4" />}
            active={tool === "pan"}
            onClick={() => handleToolChange("pan")}
            title="拖动 (Space)"
          />
        </div>

        {/* 网格开关 */}
        <IconButton
          icon={<CircleDot className="w-4 h-4" />}
          onClick={toggleGrid}
          active={showGrid}
          title={showGrid ? "隐藏网格" : "显示网格"}
        />

        <Divider />

        {/* 创作工具 */}
        <div className="flex items-center gap-1.5">
          {/* 相册 */}
          <CreativeToolButton
            icon={<Images className="w-4 h-4" />}
            label="相册"
            onClick={() => setShowPhotoSidebar(!showPhotoSidebar)}
            active={showPhotoSidebar}
            gradient="from-blue-500 to-cyan-500"
          />

          {/* 上传 */}
          <CreativeToolButton
            icon={<ImageIcon className="w-4 h-4" />}
            label="上传"
            onClick={onAddPhoto}
            gradient="from-emerald-500 to-teal-500"
          />

          {/* 贴纸 */}
          <CreativeToolButton
            icon={<Smile className="w-4 h-4" />}
            label="贴纸"
            onClick={onToggleStickerPicker}
            active={showStickerPicker}
            gradient="from-amber-500 to-orange-500"
          />

          {/* 文字 */}
          <CreativeToolButton
            icon={<Type className="w-4 h-4" />}
            label="文字"
            onClick={onAddText}
            gradient="from-pink-500 to-rose-500"
          />

          {/* AI 魔法 */}
          <CreativeToolButton
            icon={<Sparkles className="w-4 h-4" />}
            label="AI"
            onClick={onOpenAiMagic}
            gradient="from-violet-500 to-purple-500"
            special
          />
        </div>
      </div>
    </div>
  );
}

// 分隔线
function Divider() {
  return <div className="w-px h-6 bg-amber-200/50 mx-1" />;
}

// 图标按钮
interface IconButtonProps {
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  title?: string;
}

function IconButton({ icon, onClick, disabled, active, title }: IconButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`p-2 rounded-xl transition-all duration-200 ${
        disabled
          ? "opacity-30 cursor-not-allowed"
          : active
            ? "bg-amber-100 text-amber-700"
            : "hover:bg-gray-100 text-gray-600 hover:text-gray-800"
      }`}
      title={title}
    >
      {icon}
    </button>
  );
}

// 工具切换按钮
interface ToolButtonProps {
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
  title: string;
}

function ToolButton({ icon, active, onClick, title }: ToolButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`p-2 rounded-lg transition-all duration-200 ${
        active
          ? "bg-white shadow-sm text-gray-800"
          : "text-gray-500 hover:text-gray-700 hover:bg-gray-200/50"
      }`}
      title={title}
    >
      {icon}
    </button>
  );
}

// 创作工具按钮
interface CreativeToolButtonProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
  gradient: string;
  special?: boolean;
}

function CreativeToolButton({
  icon,
  label,
  onClick,
  active = false,
  gradient,
  special = false,
}: CreativeToolButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`group relative flex items-center gap-1.5 px-3 py-2 rounded-xl transition-all duration-300 ${
        active
          ? "bg-gradient-to-r " + gradient + " text-white shadow-md"
          : special
            ? "bg-gradient-to-r " + gradient + " text-white shadow-sm hover:shadow-md hover:scale-105"
            : "bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 hover:border-gray-300 hover:shadow-sm"
      }`}
    >
      <span className={`transition-transform duration-200 ${!active && !special ? "group-hover:scale-110" : ""}`}>
        {icon}
      </span>
      <span className="text-sm font-medium">{label}</span>
    </button>
  );
}

// 保存状态指示器
interface SaveStatusIndicatorProps {
  status: "idle" | "saving" | "saved" | "error";
}

function SaveStatusIndicator({ status }: SaveStatusIndicatorProps) {
  const statusConfig: Record<
    SaveStatusIndicatorProps["status"],
    { icon: typeof Cloud | null; color: string; bgColor: string; text: string; spin?: boolean }
  > = {
    idle: { icon: null, color: "", bgColor: "", text: "" },
    saving: {
      icon: Loader2,
      color: "text-blue-600",
      bgColor: "bg-blue-50",
      text: "保存中",
      spin: true,
    },
    saved: {
      icon: Cloud,
      color: "text-emerald-600",
      bgColor: "bg-emerald-50",
      text: "已保存",
    },
    error: {
      icon: CloudOff,
      color: "text-red-600",
      bgColor: "bg-red-50",
      text: "保存失败",
    },
  };

  const config = statusConfig[status];

  if (!config.icon) {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-gray-50 text-gray-400">
        <Cloud className="w-3.5 h-3.5" />
        <span className="text-xs">自动保存</span>
      </div>
    );
  }

  const Icon = config.icon;

  return (
    <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg ${config.bgColor}`}>
      <Icon
        className={`w-3.5 h-3.5 ${config.color} ${config.spin ? "animate-spin" : ""}`}
      />
      <span className={`text-xs font-medium ${config.color}`}>{config.text}</span>
    </div>
  );
}

export const CanvasTopToolbar = memo(CanvasTopToolbarComponent);
