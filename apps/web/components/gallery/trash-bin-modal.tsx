"use client";

import { useState, useEffect } from "react";
import type { Photo } from "@/types/storage";
import Image from "next/image";
import { X, RotateCcw, Trash2, Check } from "lucide-react";

interface TrashBinModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void; // 操作完成后刷新
}

/**
 * 回收站 Modal
 *
 * 显示所有回收站照片，支持：
 * - 单张恢复
 * - 批量选择恢复
 * - 清空回收站
 */
export function TrashBinModal({
  isOpen,
  onClose,
  onComplete,
}: TrashBinModalProps) {
  const [trashedPhotos, setTrashedPhotos] = useState<Photo[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [emptying, setEmptying] = useState(false);

  // 加载回收站照片
  useEffect(() => {
    if (isOpen) {
      fetchTrashedPhotos();
    }
  }, [isOpen]);

  const fetchTrashedPhotos = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/photos/trash");
      if (!response.ok) throw new Error("Failed to fetch");

      const data = await response.json();
      setTrashedPhotos(data.photos || []);
    } catch (error) {
      console.error("Failed to fetch trashed photos:", error);
      alert("Failed to load trash bin");
    } finally {
      setLoading(false);
    }
  };

  // 全选/取消全选
  const toggleSelectAll = () => {
    if (selectedIds.size === trashedPhotos.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(trashedPhotos.map(p => p.id)));
    }
  };

  // 切换单张选择
  const toggleSelect = (photoId: string) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(photoId)) {
        newSet.delete(photoId);
      } else {
        newSet.add(photoId);
      }
      return newSet;
    });
  };

  // 恢复选中的照片
  const handleRestoreSelected = async () => {
    if (selectedIds.size === 0) return;

    const confirmed = confirm(
      `Restore ${selectedIds.size} photo${selectedIds.size > 1 ? "s" : ""}?`
    );
    if (!confirmed) return;

    setRestoring(true);

    try {
      // 并行恢复
      const restorePromises = Array.from(selectedIds).map(photoId =>
        fetch(`/api/photos/trash/${photoId}`, { method: "POST" })
      );

      await Promise.all(restorePromises);

      // 刷新列表
      await fetchTrashedPhotos();
      setSelectedIds(new Set());

      // 通知父组件刷新
      onComplete();
    } catch (error) {
      console.error("Failed to restore photos:", error);
      alert("Failed to restore some photos. Please try again.");
    } finally {
      setRestoring(false);
    }
  };

  // 恢复单张照片
  const handleRestoreSingle = async (photoId: string) => {
    setRestoring(true);

    try {
      const response = await fetch(`/api/photos/trash/${photoId}`, {
        method: "POST",
      });

      if (!response.ok) throw new Error("Failed to restore");

      // 刷新列表
      await fetchTrashedPhotos();

      // 通知父组件刷新
      onComplete();
    } catch (error) {
      console.error("Failed to restore photo:", error);
      alert("Failed to restore photo. Please try again.");
    } finally {
      setRestoring(false);
    }
  };

  // 清空回收站
  const handleEmptyTrash = async () => {
    if (trashedPhotos.length === 0) return;

    const confirmed = confirm(
      `Permanently delete all ${trashedPhotos.length} photo${trashedPhotos.length > 1 ? "s" : ""} in trash? This action cannot be undone.`
    );
    if (!confirmed) return;

    setEmptying(true);

    try {
      const response = await fetch("/api/photos/trash/empty", {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Failed to empty trash");

      // 刷新列表
      await fetchTrashedPhotos();
      setSelectedIds(new Set());

      // 通知父组件刷新
      onComplete();
    } catch (error) {
      console.error("Failed to empty trash:", error);
      alert("Failed to empty trash. Please try again.");
    } finally {
      setEmptying(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-card rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div className="flex items-center gap-3">
            <Trash2 className="w-6 h-6 text-foreground" />
            <h2 className="text-2xl font-bold text-foreground">
              Trash Bin ({trashedPhotos.length})
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-accent rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toolbar */}
        {trashedPhotos.length > 0 && (
          <div className="flex items-center justify-between p-4 border-b border-border bg-muted/50">
            <div className="flex items-center gap-4">
              <button
                onClick={toggleSelectAll}
                className="text-sm text-foreground hover:text-primary transition-colors"
              >
                {selectedIds.size === trashedPhotos.length ? "Deselect All" : "Select All"}
              </button>
              {selectedIds.size > 0 && (
                <span className="text-sm text-muted-foreground">
                  {selectedIds.size} selected
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {selectedIds.size > 0 && (
                <button
                  onClick={handleRestoreSelected}
                  disabled={restoring}
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Restore ({selectedIds.size})</span>
                </button>
              )}
              <button
                onClick={handleEmptyTrash}
                disabled={emptying}
                className="flex items-center gap-2 px-4 py-2 bg-destructive text-destructive-foreground rounded-lg hover:bg-destructive/90 transition-colors disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                <span>{emptying ? "Emptying..." : "Empty Trash"}</span>
              </button>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="text-center">
                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mb-2 mx-auto" />
                <p className="text-muted-foreground">Loading...</p>
              </div>
            </div>
          ) : trashedPhotos.length === 0 ? (
            <div className="flex items-center justify-center py-20">
              <div className="text-center">
                <Trash2 className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-foreground mb-2">
                  Trash is empty
                </h3>
                <p className="text-muted-foreground">
                  Deleted photos will appear here
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {trashedPhotos.map(photo => (
                <div
                  key={photo.id}
                  className={`group relative bg-muted rounded-lg overflow-hidden cursor-pointer transition-all ${
                    selectedIds.has(photo.id) ? "ring-4 ring-primary" : ""
                  }`}
                  onClick={() => toggleSelect(photo.id)}
                >
                  {/* Image */}
                  <div className="relative aspect-square">
                    <Image
                      src={photo.fileUrl}
                      alt={photo.originalName}
                      fill
                      className="object-cover"
                      sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
                    />
                  </div>

                  {/* Selection Checkbox */}
                  <div className="absolute top-2 right-2">
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center transition-all ${
                        selectedIds.has(photo.id)
                          ? "bg-primary text-primary-foreground"
                          : "bg-background/80 border-2 border-border"
                      }`}
                    >
                      {selectedIds.has(photo.id) && <Check className="w-4 h-4" />}
                    </div>
                  </div>

                  {/* Restore Button */}
                  <div className="absolute bottom-2 left-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRestoreSingle(photo.id);
                      }}
                      disabled={restoring}
                      className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded text-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
                    >
                      <RotateCcw className="w-4 h-4" />
                      <span>Restore</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
