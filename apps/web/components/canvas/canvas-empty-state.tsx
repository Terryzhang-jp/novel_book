/**
 * CanvasEmptyState Component
 *
 * Displayed when the canvas has no elements.
 * Creates an inspiring, warm welcome that invites creativity.
 */

"use client";

import { memo, useState, useEffect } from "react";
import {
  Image as ImageIcon,
  Type,
  Smile,
  Sparkles,
  PenLine,
  Camera,
  Heart,
  Star,
} from "lucide-react";

interface CanvasEmptyStateProps {
  onAddPhoto: () => void;
  onAddText: () => void;
  onAddSticker: () => void;
  onOpenAiMagic: () => void;
}

// 灵感提示语
const INSPIRATIONS = [
  "记录今天的美好瞬间 ✨",
  "用照片讲述你的故事 📸",
  "写下此刻的心情 💭",
  "创作属于你的手账 🎨",
  "让回忆变得更有温度 🌸",
  "每一页都是独特的风景 🌈",
];

function CanvasEmptyStateComponent({
  onAddPhoto,
  onAddText,
  onAddSticker,
  onOpenAiMagic,
}: CanvasEmptyStateProps) {
  const [inspiration, setInspiration] = useState(INSPIRATIONS[0]);

  // 随机选择一条灵感提示
  useEffect(() => {
    const randomIndex = Math.floor(Math.random() * INSPIRATIONS.length);
    setInspiration(INSPIRATIONS[randomIndex]);
  }, []);

  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
      <div className="floating-card bg-white/95 backdrop-blur-md rounded-3xl p-10 max-w-lg mx-4 text-center pointer-events-auto border border-amber-100/50">
        {/* 装饰性图标 */}
        <div className="flex justify-center gap-3 mb-6">
          <DecorativeIcon icon={<Camera className="w-4 h-4" />} delay={0} />
          <DecorativeIcon icon={<PenLine className="w-4 h-4" />} delay={100} />
          <DecorativeIcon icon={<Heart className="w-4 h-4" />} delay={200} />
          <DecorativeIcon icon={<Star className="w-4 h-4" />} delay={300} />
        </div>

        {/* 主标题 */}
        <h2 className="text-2xl font-semibold text-gray-800 mb-3">
          开始创作
        </h2>

        {/* 灵感提示 */}
        <p className="text-gray-500 mb-8 text-lg gentle-pulse">
          {inspiration}
        </p>

        {/* 快捷操作按钮 */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          <CreativeButton
            icon={<ImageIcon className="w-6 h-6" />}
            label="添加照片"
            description="从相册选择"
            onClick={onAddPhoto}
            gradient="from-blue-400 to-cyan-400"
          />
          <CreativeButton
            icon={<Type className="w-6 h-6" />}
            label="添加文字"
            description="写下想法"
            onClick={onAddText}
            gradient="from-emerald-400 to-teal-400"
          />
          <CreativeButton
            icon={<Smile className="w-6 h-6" />}
            label="添加贴纸"
            description="表情装饰"
            onClick={onAddSticker}
            gradient="from-amber-400 to-orange-400"
          />
          <CreativeButton
            icon={<Sparkles className="w-6 h-6" />}
            label="AI 魔法"
            description="智能生成"
            onClick={onOpenAiMagic}
            gradient="from-violet-400 to-purple-400"
          />
        </div>

        {/* 操作提示 */}
        <div className="flex items-center justify-center gap-6 text-xs text-gray-400">
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-[10px]">滚轮</kbd>
            缩放
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-[10px]">Space</kbd>
            拖动画布
          </span>
        </div>
      </div>
    </div>
  );
}

// 装饰性图标组件
function DecorativeIcon({ icon, delay }: { icon: React.ReactNode; delay: number }) {
  return (
    <div
      className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-50 to-orange-50 flex items-center justify-center text-amber-400 canvas-element-enter"
      style={{ animationDelay: `${delay}ms` }}
    >
      {icon}
    </div>
  );
}

// 创意按钮组件
interface CreativeButtonProps {
  icon: React.ReactNode;
  label: string;
  description: string;
  onClick: () => void;
  gradient: string;
}

function CreativeButton({
  icon,
  label,
  description,
  onClick,
  gradient,
}: CreativeButtonProps) {
  return (
    <button
      onClick={onClick}
      className="group relative flex flex-col items-center gap-2 p-5 rounded-2xl bg-white border-2 border-gray-100 hover:border-transparent transition-all duration-300 hover:shadow-lg toolbar-btn-hover overflow-hidden"
    >
      {/* 悬停时的渐变背景 */}
      <div
        className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-0 group-hover:opacity-10 transition-opacity duration-300`}
      />

      {/* 图标 */}
      <div
        className={`w-12 h-12 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center text-white shadow-sm group-hover:scale-110 transition-transform duration-300`}
      >
        {icon}
      </div>

      {/* 文字 */}
      <div className="relative">
        <span className="font-medium text-gray-700 block">{label}</span>
        <span className="text-xs text-gray-400">{description}</span>
      </div>
    </button>
  );
}

export const CanvasEmptyState = memo(CanvasEmptyStateComponent);
