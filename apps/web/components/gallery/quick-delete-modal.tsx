"use client";

import { useState, useEffect, useCallback } from "react";
import type { Photo } from "@/types/storage";
import Image from "next/image";
import { X, ChevronLeft, ChevronRight, Trash2} from "lucide-react";

interface QuickDeleteModalProps {
  isOpen: boolean;
  photos: Photo[]; // 未在回收站的照片列表
  initialIndex: number; // 起始照片索引
  onClose: () => void;
  onTrash: (photoIds: string[]) => Promise<void>; // 移入回收站回调
}

/**
 * 快速删除模式 - 全屏照片浏览+左右键快速筛选
 *
 * 左键/左箭头 → 移入回收站
 * 右键/右箭头 → 保留（跳到下一张）
 * ESC → 关闭
 */
export function QuickDeleteModal({
  isOpen,
  photos,
  initialIndex,
  onClose,
  onTrash,
}: QuickDeleteModalProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [trashedIds, setTrashedIds] = useState<Set<string>>(new Set());
  const [processing, setProcessing] = useState(false);

  // 当modal打开时重置索引
  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(initialIndex);
      setTrashedIds(new Set());
    }
  }, [isOpen, initialIndex]);

  // 过滤掉已在本次会话中移入回收站的照片
  const availablePhotos = photos.filter(p => !trashedIds.has(p.id));
  const currentPhoto = availablePhotos[currentIndex];

  // 导航到上一张
  const goToPrevious = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  }, [currentIndex]);

  // 导航到下一张（保留当前照片）
  const goToNext = useCallback(() => {
    if (currentIndex < availablePhotos.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  }, [currentIndex, availablePhotos.length]);

  // 移入回收站（向左）
  const handleTrash = useCallback(async () => {
    if (!currentPhoto || processing) return;

    setProcessing(true);

    try {
      // 调用回调函数
      await onTrash([currentPhoto.id]);

      // 本地标记为已删除
      setTrashedIds(prev => new Set([...prev, currentPhoto.id]));

      // 如果还有照片，保持当前索引（因为数组会变短）
      // 如果当前是最后一张，索引减1
      if (currentIndex >= availablePhotos.length - 1 && currentIndex > 0) {
        setCurrentIndex(currentIndex - 1);
      }
    } catch (error) {
      console.error("Failed to trash photo:", error);
      alert("Failed to move photo to trash. Please try again.");
    } finally {
      setProcessing(false);
    }
  }, [currentPhoto, currentIndex, availablePhotos.length, onTrash, processing]);

  // 键盘事件
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (processing) return;

      switch (e.key) {
        case "ArrowLeft":
          handleTrash(); // 左键 = 移入回收站
          break;
        case "ArrowRight":
          goToNext(); // 右键 = 保留
          break;
        case "Escape":
          onClose();
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, processing, handleTrash, goToNext, onClose]);

  if (!isOpen || !currentPhoto) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* 顶部状态栏 */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-4 bg-gradient-to-b from-black/80 to-transparent">
        <div className="text-white text-sm font-medium">
          {currentIndex + 1} / {availablePhotos.length}
        </div>
        <button
          onClick={onClose}
          className="text-white hover:bg-white/20 rounded-full p-2 transition-colors"
          title="Close (ESC)"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* 中间照片区域 */}
      <div className="flex-1 relative flex items-center justify-center p-8">
        <Image
          src={currentPhoto.fileUrl}
          alt={currentPhoto.originalName}
          fill
          className="object-contain"
          sizes="100vw"
          priority
        />
      </div>

      {/* 底部操作按钮 */}
      <div className="absolute bottom-0 left-0 right-0 z-10 flex items-center justify-center gap-4 p-8 bg-gradient-to-t from-black/80 to-transparent">
        <button
          onClick={handleTrash}
          disabled={processing}
          className="flex items-center gap-3 px-8 py-4 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-lg font-medium"
          title="Move to Trash (←)"
        >
          <Trash2 className="w-6 h-6" />
          <span>Move to Trash (←)</span>
        </button>

        <button
          onClick={goToNext}
          disabled={processing || currentIndex >= availablePhotos.length - 1}
          className="flex items-center gap-3 px-8 py-4 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-lg font-medium"
          title="Keep (→)"
        >
          <span>Keep (→)</span>
          <ChevronRight className="w-6 h-6" />
        </button>
      </div>

      {/* 如果已浏览完所有照片 */}
      {availablePhotos.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/90 z-20">
          <div className="text-center text-white">
            <div className="text-4xl mb-4">✅</div>
            <h3 className="text-2xl font-bold mb-2">All Done!</h3>
            <p className="text-gray-300 mb-6">
              You've reviewed all photos. {trashedIds.size} moved to trash.
            </p>
            <button
              onClick={onClose}
              className="px-6 py-3 bg-white text-black rounded-lg hover:bg-gray-200 transition-colors font-medium"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
