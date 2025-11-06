"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
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
  const [markedForDeletion, setMarkedForDeletion] = useState<Set<string>>(new Set());

  // 当modal打开时重置索引
  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(initialIndex);
      setMarkedForDeletion(new Set());
    }
  }, [isOpen, initialIndex]);

  // 使用 useMemo 优化过滤性能 - 仅在依赖变化时重新计算
  const availablePhotos = useMemo(() =>
    photos.filter(p => !markedForDeletion.has(p.id)),
    [photos, markedForDeletion]
  );
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

  // 标记删除（向左）- 仅本地状态，无 API 调用
  const handleMarkForDeletion = useCallback(() => {
    if (!currentPhoto) return;

    // 标记照片为待删除
    setMarkedForDeletion(prev => new Set([...prev, currentPhoto.id]));

    // 导航逻辑：如果当前是最后一张，返回上一张
    if (currentIndex >= availablePhotos.length - 1 && currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  }, [currentPhoto, currentIndex, availablePhotos.length]);

  // 关闭时批量处理
  const handleClose = useCallback(async () => {
    // 如果有标记的照片，批量处理
    if (markedForDeletion.size > 0) {
      const confirmed = confirm(
        `Move ${markedForDeletion.size} photo${markedForDeletion.size > 1 ? 's' : ''} to trash?`
      );

      if (!confirmed) {
        onClose();
        return;
      }

      try {
        await onTrash(Array.from(markedForDeletion));
        onClose();
      } catch (error) {
        console.error('Failed to trash photos:', error);
        alert('Failed to move photos to trash. Please try again.');
        // 不关闭模态框，让用户重试
      }
    } else {
      // 没有标记，直接关闭
      onClose();
    }
  }, [markedForDeletion, onTrash, onClose]);

  // 键盘事件
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowLeft":
          handleMarkForDeletion(); // 左键 = 标记删除
          break;
        case "ArrowRight":
          goToNext(); // 右键 = 保留
          break;
        case "Escape":
          handleClose(); // ESC = 关闭（会触发批量处理）
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handleMarkForDeletion, goToNext, handleClose]);

  if (!isOpen || !currentPhoto) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* 顶部状态栏 */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-4 bg-gradient-to-b from-black/80 to-transparent">
        <div className="text-white text-sm font-medium flex items-center gap-4">
          <span>{currentIndex + 1} / {availablePhotos.length}</span>
          {markedForDeletion.size > 0 && (
            <span className="bg-red-600 px-3 py-1 rounded-full font-bold">
              {markedForDeletion.size} marked
            </span>
          )}
        </div>
        <button
          onClick={handleClose}
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
        />

        {/* 标记指示器 */}
        {markedForDeletion.has(currentPhoto.id) && (
          <div className="absolute top-12 left-12 bg-red-600 text-white px-6 py-3 rounded-lg font-bold text-lg shadow-lg">
            ✓ Marked for Deletion
          </div>
        )}
      </div>

      {/* 底部操作按钮 */}
      <div className="absolute bottom-0 left-0 right-0 z-10 flex items-center justify-center gap-4 p-8 bg-gradient-to-t from-black/80 to-transparent">
        <button
          onClick={handleMarkForDeletion}
          disabled={markedForDeletion.has(currentPhoto.id)}
          className="flex items-center gap-3 px-8 py-4 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-lg font-medium"
          title="Mark for Deletion (←)"
        >
          <Trash2 className="w-6 h-6" />
          <span>{markedForDeletion.has(currentPhoto.id) ? 'Marked ✓' : 'Mark for Deletion (←)'}</span>
        </button>

        <button
          onClick={goToNext}
          disabled={currentIndex >= availablePhotos.length - 1}
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
              You've reviewed all photos. {markedForDeletion.size} marked for deletion.
            </p>
            <button
              onClick={handleClose}
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
