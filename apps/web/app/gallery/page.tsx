"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Upload, Trash2, X, MapPin, Zap } from "lucide-react";
import type { Photo, PhotoCategory, PhotoStats } from "@/types/storage";
import { CategoryFilter } from "@/components/gallery/category-filter";
import { PhotoGrid } from "@/components/gallery/photo-grid";
import { PhotoDetailModal } from "@/components/photos/photo-detail-modal";
import { BatchLocationAssignment } from "@/components/photos/batch-location-assignment";
import { QuickDeleteModal } from "@/components/gallery/quick-delete-modal";
import { TrashBinModal } from "@/components/gallery/trash-bin-modal";
import { AppLayout } from "@/components/layout/app-layout";
import { ClusterSection } from "@/components/gallery/cluster-section";
import { ClusterSettings } from "@/components/gallery/cluster-settings";
import {
  clusterPhotosByTime,
  DEFAULT_CLUSTER_THRESHOLD,
} from "@/lib/utils/photo-clustering";

const PAGE_SIZE = 50; // 每次加载50张照片

export default function GalleryPage() {
  const router = useRouter();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [stats, setStats] = useState<PhotoStats | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<PhotoCategory | "all">("all");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedPhotos, setSelectedPhotos] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [detailPhotoId, setDetailPhotoId] = useState<string | null>(null);
  const [showBatchLocationModal, setShowBatchLocationModal] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  // 聚类阈值（分钟）
  const [clusterThreshold, setClusterThreshold] = useState(DEFAULT_CLUSTER_THRESHOLD);

  // 快速删除模式 & 回收站
  const [showQuickDeleteModal, setShowQuickDeleteModal] = useState(false);
  const [showTrashBinModal, setShowTrashBinModal] = useState(false);
  const [trashedCount, setTrashedCount] = useState(0);

  // 初始加载
  useEffect(() => {
    fetchPhotos(true);
  }, []);

  // 当分类改变时，重置并重新加载
  useEffect(() => {
    fetchPhotos(true);
  }, [selectedCategory]);

  const fetchPhotos = async (reset = false) => {
    try {
      if (reset) {
        setLoading(true);
        setOffset(0);
        setHasMore(true);
      } else {
        setLoadingMore(true);
      }

      const currentOffset = reset ? 0 : offset;
      const categoryParam = selectedCategory === "all" ? "" : `&category=${selectedCategory}`;
      const response = await fetch(
        `/api/photos?limit=${PAGE_SIZE}&offset=${currentOffset}${categoryParam}`
      );

      if (!response.ok) {
        if (response.status === 401) {
          router.push("/login");
          return;
        }
        throw new Error("Failed to fetch photos");
      }

      const data = await response.json();

      if (reset) {
        setPhotos(data.photos);
        setStats(data.stats);
        setUserId(data.userId);

        // 同时获取回收站数量
        fetchTrashedCount();
      } else {
        setPhotos(prev => [...prev, ...data.photos]);
      }

      // 如果返回的照片数量少于 PAGE_SIZE，说明没有更多了
      setHasMore(data.photos.length === PAGE_SIZE);
      setOffset(currentOffset + data.photos.length);
    } catch (error) {
      console.error("Error fetching photos:", error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  // 获取回收站照片数量
  const fetchTrashedCount = async () => {
    try {
      const response = await fetch("/api/photos/trash");
      if (!response.ok) return;

      const data = await response.json();
      setTrashedCount(data.count || 0);
    } catch (error) {
      console.error("Error fetching trashed count:", error);
    }
  };

  // 移入回收站（用于快速删除模式）
  const handleTrashPhotos = async (photoIds: string[]) => {
    try {
      const response = await fetch("/api/photos/trash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoIds }),
      });

      if (!response.ok) {
        throw new Error("Failed to trash photos");
      }

      // 刷新照片列表和回收站数量
      await fetchPhotos(true);
    } catch (error) {
      console.error("Error trashing photos:", error);
      throw error;
    }
  };

  // 无限滚动：监听底部元素
  useEffect(() => {
    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    observerRef.current = new IntersectionObserver(
      (entries) => {
        const target = entries[0];
        if (target.isIntersecting && hasMore && !loadingMore && !loading) {
          fetchPhotos(false);
        }
      },
      { threshold: 0.1 }
    );

    if (loadMoreRef.current) {
      observerRef.current.observe(loadMoreRef.current);
    }

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [hasMore, loadingMore, loading, offset]);

  const handlePhotoDelete = async (photoId: string) => {
    // 乐观更新：立即从 UI 中移除照片
    const previousPhotos = photos;
    setPhotos((prev) => prev.filter((p) => p.id !== photoId));

    try {
      const response = await fetch(`/api/photos/${photoId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete photo");
      }

      // 成功后更新统计信息
      if (stats) {
        const deletedPhoto = previousPhotos.find((p) => p.id === photoId);
        if (deletedPhoto) {
          setStats({
            ...stats,
            total: stats.total - 1,
            byCategory: {
              ...stats.byCategory,
              [deletedPhoto.category]: Math.max(0, (stats.byCategory[deletedPhoto.category] || 0) - 1),
            },
          });
        }
      }
    } catch (error) {
      console.error("Error deleting photo:", error);
      // 失败时恢复照片并显示错误
      setPhotos(previousPhotos);

      // 提供更详细的错误信息
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
      alert(`Failed to delete photo: ${errorMessage}\n\nPlease check your connection and try again.`);
      throw error;
    }
  };

  const toggleSelectionMode = () => {
    setSelectionMode(!selectionMode);
    setSelectedPhotos(new Set());
  };

  const togglePhotoSelection = (photoId: string) => {
    setSelectedPhotos((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(photoId)) {
        newSet.delete(photoId);
      } else {
        newSet.add(photoId);
      }
      return newSet;
    });
  };

  const selectAll = () => {
    const allPhotoIds = new Set(filteredPhotos.map((p) => p.id));
    setSelectedPhotos(allPhotoIds);
  };

  const deselectAll = () => {
    setSelectedPhotos(new Set());
  };

  const handleBatchDelete = async () => {
    if (selectedPhotos.size === 0) return;

    const confirmed = confirm(
      `Are you sure you want to delete ${selectedPhotos.size} photo${selectedPhotos.size > 1 ? "s" : ""}?`
    );

    if (!confirmed) return;

    setDeleting(true);

    // 乐观更新：立即从 UI 中移除所有选中的照片
    const previousPhotos = photos;
    const deletedPhotos = photos.filter((p) => selectedPhotos.has(p.id));
    setPhotos((prev) => prev.filter((p) => !selectedPhotos.has(p.id)));

    try {
      // Delete photos in parallel (much faster)
      const deletePromises = Array.from(selectedPhotos).map(async (photoId) => {
        const response = await fetch(`/api/photos/${photoId}`, {
          method: "DELETE",
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => 'Unknown error');
          throw new Error(`Failed to delete photo ${photoId}: ${errorText}`);
        }
        return photoId;
      });

      // Wait for all deletions to complete
      await Promise.all(deletePromises);

      // 成功后更新统计信息
      if (stats) {
        const categoryCounts: Record<string, number> = {};
        deletedPhotos.forEach((photo) => {
          categoryCounts[photo.category] = (categoryCounts[photo.category] || 0) + 1;
        });

        const newByCategory = { ...stats.byCategory };
        Object.entries(categoryCounts).forEach(([category, count]) => {
          newByCategory[category] = Math.max(0, (newByCategory[category] || 0) - count);
        });

        setStats({
          ...stats,
          total: stats.total - selectedPhotos.size,
          byCategory: newByCategory,
        });
      }

      setSelectedPhotos(new Set());
      setSelectionMode(false);
    } catch (error) {
      console.error("Error deleting photos:", error);
      // 失败时恢复照片并显示错误
      setPhotos(previousPhotos);

      // 提供更详细的错误信息
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
      alert(`Failed to delete photos: ${errorMessage}\n\nPlease check your connection and try again.`);
    } finally {
      setDeleting(false);
    }
  };

  /**
   * Handle batch location assignment
   */
  const handleBatchLocationClick = () => {
    if (selectedPhotos.size === 0) return;
    setShowBatchLocationModal(true);
  };

  /**
   * Handle batch location assignment completion
   */
  const handleBatchLocationComplete = async (result: { success: number; failed: number }) => {
    // Close the modal
    setShowBatchLocationModal(false);

    // Refresh photos to show updated location data (reset to first page)
    await fetchPhotos(true);

    // Optionally: clear selection and exit selection mode
    // Commenting this out so users can continue selecting if needed
    // setSelectedPhotos(new Set());
    // setSelectionMode(false);
  };

  // 由于API已经按category过滤，photos就是过滤后的结果
  const filteredPhotos = photos;

  /**
   * 对照片进行时间聚类
   * 使用 useMemo 缓存结果，仅在 photos 或 clusterThreshold 变化时重新计算
   */
  const photoClusters = useMemo(() => {
    return clusterPhotosByTime(filteredPhotos, clusterThreshold);
  }, [filteredPhotos, clusterThreshold]);

  /**
   * Handle photo click to open detail modal
   */
  const handlePhotoClick = (photoId: string) => {
    setDetailPhotoId(photoId);
  };

  /**
   * Handle navigation in photo detail modal
   */
  const handleDetailNavigate = (direction: 'prev' | 'next') => {
    if (!detailPhotoId) return;

    const currentIndex = filteredPhotos.findIndex((p) => p.id === detailPhotoId);
    if (currentIndex === -1) return;

    if (direction === 'prev' && currentIndex > 0) {
      setDetailPhotoId(filteredPhotos[currentIndex - 1].id);
    } else if (direction === 'next' && currentIndex < filteredPhotos.length - 1) {
      setDetailPhotoId(filteredPhotos[currentIndex + 1].id);
    }
  };

  /**
   * Get navigation state for detail modal
   */
  const getNavigationState = () => {
    if (!detailPhotoId) return { hasPrev: false, hasNext: false };

    const currentIndex = filteredPhotos.findIndex((p) => p.id === detailPhotoId);
    if (currentIndex === -1) return { hasPrev: false, hasNext: false };

    return {
      hasPrev: currentIndex > 0,
      hasNext: currentIndex < filteredPhotos.length - 1,
    };
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="text-center">
            <div className="text-4xl mb-4">📷</div>
            <p className="text-muted-foreground">Loading photos...</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-border bg-card shadow-sm">
        <div className="max-w-7xl mx-auto px-8 py-6">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-3xl font-bold text-foreground">Photo Gallery</h1>
            <div className="flex items-center gap-4">
              {!selectionMode ? (
                <>
                  {/* 聚类设置 */}
                  <ClusterSettings onChange={setClusterThreshold} />

                  {/* 快速删除模式 */}
                  <button
                    onClick={() => setShowQuickDeleteModal(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                    disabled={photos.length === 0}
                    title="快速删除模式：左键移入回收站，右键保留"
                  >
                    <Zap className="w-4 h-4" />
                    <span>Quick Delete</span>
                  </button>

                  {/* 回收站 */}
                  <button
                    onClick={() => setShowTrashBinModal(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-muted text-foreground rounded-lg hover:bg-accent transition-colors relative"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Trash</span>
                    {trashedCount > 0 && (
                      <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                        {trashedCount > 99 ? '99+' : trashedCount}
                      </span>
                    )}
                  </button>

                  <button
                    onClick={toggleSelectionMode}
                    className="flex items-center gap-2 px-4 py-2 bg-muted text-foreground rounded-lg hover:bg-accent transition-colors"
                    disabled={photos.length === 0}
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Select</span>
                  </button>
                  <Link
                    href="/gallery/upload"
                    className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
                  >
                    <Upload className="w-4 h-4" />
                    <span>Upload</span>
                  </Link>
                </>
              ) : (
                <>
                  <button
                    onClick={selectAll}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Select All
                  </button>
                  <button
                    onClick={deselectAll}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Deselect All
                  </button>
                  <button
                    onClick={handleBatchLocationClick}
                    disabled={selectedPhotos.size === 0}
                    className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <MapPin className="w-4 h-4" />
                    <span>Assign Location ({selectedPhotos.size})</span>
                  </button>
                  <button
                    onClick={handleBatchDelete}
                    disabled={selectedPhotos.size === 0 || deleting}
                    className="flex items-center gap-2 px-4 py-2 bg-destructive text-destructive-foreground rounded-lg hover:bg-destructive/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>
                      {deleting
                        ? "Deleting..."
                        : `Delete (${selectedPhotos.size})`}
                    </span>
                  </button>
                  <button
                    onClick={toggleSelectionMode}
                    className="flex items-center gap-2 px-4 py-2 bg-muted text-foreground rounded-lg hover:bg-accent transition-colors"
                  >
                    <X className="w-4 h-4" />
                    <span>Cancel</span>
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Category Filter */}
          {stats && (
            <CategoryFilter
              stats={stats}
              selectedCategory={selectedCategory}
              onCategoryChange={setSelectedCategory}
            />
          )}
        </div>
      </div>

      {/* Photo Clusters */}
      <div className="max-w-7xl mx-auto px-8 py-8">
        {userId ? (
          <>
            {/* 渲染所有聚类组 */}
            {photoClusters.map((cluster) => (
              <ClusterSection
                key={cluster.id}
                cluster={cluster}
                userId={userId}
                onPhotoDelete={handlePhotoDelete}
                selectionMode={selectionMode}
                selectedPhotos={selectedPhotos}
                onPhotoToggle={togglePhotoSelection}
                onPhotoClick={handlePhotoClick}
              />
            ))}

            {/* Loading More Indicator */}
            {loadingMore && (
              <div className="flex justify-center items-center py-8">
                <div className="text-center">
                  <div className="inline-block w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mb-2" />
                  <p className="text-sm text-muted-foreground">Loading more photos...</p>
                </div>
              </div>
            )}

            {/* Intersection Observer Target */}
            <div ref={loadMoreRef} className="h-20" />

            {/* No More Photos Indicator */}
            {!hasMore && photos.length > 0 && (
              <div className="flex justify-center items-center py-8">
                <p className="text-sm text-muted-foreground">You've reached the end</p>
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="text-6xl mb-4">📷</div>
            <h3 className="text-xl font-semibold text-foreground mb-2">No photos yet</h3>
            <p className="text-muted-foreground mb-6">
              Upload your first photo to get started
            </p>
            <Link
              href="/gallery/upload"
              className="flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
            >
              <Upload className="w-5 h-5" />
              <span>Upload Photo</span>
            </Link>
          </div>
        )}
      </div>

      {/* Photo Detail Modal */}
      {userId && (
        <PhotoDetailModal
          isOpen={!!detailPhotoId}
          photoId={detailPhotoId}
          userId={userId}
          onClose={() => setDetailPhotoId(null)}
          onNavigate={handleDetailNavigate}
          hasPrev={getNavigationState().hasPrev}
          hasNext={getNavigationState().hasNext}
          onPhotoUpdate={fetchPhotos}
        />
      )}

      {/* Batch Location Assignment Modal */}
      <BatchLocationAssignment
        isOpen={showBatchLocationModal}
        photoIds={Array.from(selectedPhotos)}
        onClose={() => setShowBatchLocationModal(false)}
        onComplete={handleBatchLocationComplete}
      />

      {/* Quick Delete Modal */}
      <QuickDeleteModal
        isOpen={showQuickDeleteModal}
        photos={filteredPhotos}
        initialIndex={0}
        onClose={() => setShowQuickDeleteModal(false)}
        onTrash={handleTrashPhotos}
      />

      {/* Trash Bin Modal */}
      <TrashBinModal
        isOpen={showTrashBinModal}
        onClose={() => setShowTrashBinModal(false)}
        onComplete={() => fetchPhotos(true)}
      />
      </div>
    </AppLayout>
  );
}
