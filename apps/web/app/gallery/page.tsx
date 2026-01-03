"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Upload, Trash2, X, MapPin, Zap, ArrowUpDown, Wand2, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { Photo, PhotoCategory, PhotoStats, Location } from "@/types/storage";
import { CategoryFilter } from "@/components/gallery/category-filter";
import { LocationFilter } from "@/components/gallery/location-filter";
import { PhotoGrid } from "@/components/gallery/photo-grid";
import { PhotoDetailModal } from "@/components/photos/photo-detail-modal";
import { BatchLocationAssignment } from "@/components/photos/batch-location-assignment";
import { QuickDeleteModal } from "@/components/gallery/quick-delete-modal";
import { TrashBinModal } from "@/components/gallery/trash-bin-modal";
import { AppLayout } from "@/components/layout/app-layout";
import { ClusterSection } from "@/components/gallery/cluster-section";
import { ClusterSettings } from "@/components/gallery/cluster-settings";
import { MagazineView } from '@/components/gallery/magazine-view';
import {
  clusterPhotosByTime,
  DEFAULT_CLUSTER_THRESHOLD,
} from "@/lib/utils/photo-clustering";
import {
  downloadPhotosAsZip,
  generateZipFilename,
} from "@/lib/utils/photo-download";

const PAGE_SIZE = 50; // 每次加载50张照片

export default function GalleryPage() {
  const router = useRouter();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [stats, setStats] = useState<PhotoStats | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'magazine'>('grid'); // Add viewMode state
  const [selectedCategory, setSelectedCategory] = useState<PhotoCategory | "all">("all");
  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<string | "all">("all");
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

  // 排序方式：'newest' = 最新在前，'oldest' = 最旧在前
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');

  // 批量删除确认
  const [showBatchDeleteConfirm, setShowBatchDeleteConfirm] = useState(false);

  // 初始加载
  useEffect(() => {
    fetchPhotos(true);
    fetchLocations();
  }, []);

  // 当分类改变时，重置并重新加载
  useEffect(() => {
    fetchPhotos(true);
    setSelectedLocationId("all"); // 重置地点筛选
  }, [selectedCategory]);

  // 当排序方式改变时，重置并重新加载
  useEffect(() => {
    if (photos.length > 0) { // 只在已加载照片后才触发
      fetchPhotos(true);
    }
  }, [sortOrder]);

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
      const sortParam = `&sortOrder=${sortOrder}`;
      const response = await fetch(
        `/api/photos?limit=${PAGE_SIZE}&offset=${currentOffset}${categoryParam}${sortParam}`
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

  // 获取用户的所有地点
  const fetchLocations = async () => {
    try {
      const response = await fetch("/api/locations");
      if (!response.ok) return;

      const data = await response.json();
      setLocations(data.locations || []);
    } catch (error) {
      console.error("Error fetching locations:", error);
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
      toast.error(`Failed to delete photo: ${errorMessage}`);
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

  const handleBatchDelete = () => {
    if (selectedPhotos.size === 0) return;
    setShowBatchDeleteConfirm(true);
  };

  const confirmBatchDelete = async () => {
    setShowBatchDeleteConfirm(false);
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
      toast.success(`Successfully deleted ${deletedPhotos.length} photo${deletedPhotos.length > 1 ? "s" : ""}`);
    } catch (error) {
      console.error("Error deleting photos:", error);
      // 失败时恢复照片并显示错误
      setPhotos(previousPhotos);

      // 提供更详细的错误信息
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
      toast.error(`Failed to delete photos: ${errorMessage}`);
    } finally {
      setDeleting(false);
    }
  };

  // Sculpting State
  const [isSculpting, setIsSculpting] = useState(false);

  // Download State
  const [isDownloading, setIsDownloading] = useState(false);

  /**
   * Handle "Sculpt Story" action
   */
  const handleSculptStory = async () => {
    if (selectedPhotos.size === 0) return;

    try {
      setIsSculpting(true);
      const response = await fetch("/api/documents/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoIds: Array.from(selectedPhotos) }),
      });

      if (!response.ok) {
        throw new Error("Failed to generate story");
      }

      const { documentId } = await response.json();

      // Redirect to the new document
      router.push(`/documents/${documentId}`);

    } catch (error) {
      console.error("Error sculpting story:", error);
      toast.error("Failed to sculpt story. Please try again.");
      setIsSculpting(false);
    }
  };

  /**
   * Handle batch download
   */
  const handleBatchDownload = async () => {
    if (selectedPhotos.size === 0 || isDownloading) return;

    setIsDownloading(true);
    try {
      // Get selected photos from the filtered list
      const photosToDownload = filteredPhotos.filter((p) =>
        selectedPhotos.has(p.id)
      );

      const zipFilename = generateZipFilename('gallery');
      await downloadPhotosAsZip(photosToDownload, zipFilename);

      toast.success(`Downloaded ${photosToDownload.length} photo${photosToDownload.length > 1 ? 's' : ''}`);
    } catch (error) {
      console.error('Failed to download photos:', error);
      toast.error('Failed to download photos. Please try again.');
    } finally {
      setIsDownloading(false);
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

    // Clear selection and exit selection mode
    setSelectedPhotos(new Set());
    setSelectionMode(false);
  };

  // 由于API已经按category过滤，photos就是过滤后的结果
  // 然后再根据selectedLocationId进行前端筛选
  const filteredPhotos = useMemo(() => {
    if (selectedLocationId === "all") {
      return photos;
    }
    return photos.filter(photo => photo.locationId === selectedLocationId);
  }, [photos, selectedLocationId]);

  /**
   * 计算每个location的照片数量
   */
  const photoCountByLocation = useMemo(() => {
    const counts: Record<string, number> = {};
    photos.forEach(photo => {
      if (photo.locationId) {
        counts[photo.locationId] = (counts[photo.locationId] || 0) + 1;
      }
    });
    return counts;
  }, [photos]);

  // 前端排序已移至后端，直接使用 filteredPhotos
  // 后端会根据 sortOrder 参数进行排序

  /**
   * 对照片进行时间聚类
   * 使用 useMemo 缓存结果，仅在 filteredPhotos 或 clusterThreshold 变化时重新计算
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
        {/* Header - Immersive & Minimalist */}
        <div className="sticky top-0 z-20 border-b border-white/5 bg-background/80 backdrop-blur-xl transition-all duration-300">
          <div className="max-w-7xl mx-auto px-8 py-4">
            <div className="flex items-center justify-between">
              {/* Left: Title */}
              <div className="flex items-center gap-4">
                <h1 className="text-2xl font-bold tracking-tight text-foreground">Gallery</h1>
                <div className="h-6 w-px bg-border/50" />
                <span className="text-sm text-muted-foreground font-medium">
                  {stats?.total || 0} Photos
                </span>
              </div>

              {/* Right: Actions Toolbar */}
              <div className="flex items-center gap-2">
                {!selectionMode ? (
                  <>
                    {/* 聚类设置 - Icon Only */}
                    <div className="p-2 hover:bg-accent rounded-full transition-colors cursor-pointer" title="Grouping Settings">
                      <ClusterSettings onChange={setClusterThreshold} />
                    </div>

                    {/* 排序方式 - Icon Only */}
                    <button
                      onClick={() => setSortOrder(prev => prev === 'newest' ? 'oldest' : 'newest')}
                      className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-full transition-colors"
                      title={sortOrder === 'newest' ? "Sort: Newest First" : "Sort: Oldest First"}
                    >
                      <ArrowUpDown className="w-5 h-5" />
                    </button>

                    {/* 快速删除 - Icon Only */}
                    <button
                      onClick={() => setShowQuickDeleteModal(true)}
                      className="p-2 text-purple-500 hover:bg-purple-500/10 rounded-full transition-colors"
                      disabled={photos.length === 0}
                      title="Quick Delete Mode"
                    >
                      <Zap className="w-5 h-5" />
                    </button>

                    {/* 回收站 - Icon Only */}
                    <button
                      onClick={() => setShowTrashBinModal(true)}
                      className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-full transition-colors relative"
                      title="Trash Bin"
                    >
                      <Trash2 className="w-5 h-5" />
                      {trashedCount > 0 && (
                        <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full ring-2 ring-background" />
                      )}
                    </button>

                    {/* 分隔线 */}
                    <div className="h-6 w-px bg-border/50 mx-1" />

                    {/* 选择模式 */}
                    <button
                      onClick={toggleSelectionMode}
                      className="px-4 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground border border-border hover:border-foreground/20 rounded-full transition-all"
                      disabled={photos.length === 0}
                    >
                      Select
                    </button>

                    {/* 上传按钮 - Primary Capsule */}
                    <Link
                      href="/gallery/upload"
                      className="flex items-center gap-2 px-5 py-1.5 bg-primary text-primary-foreground text-sm font-medium rounded-full hover:bg-primary/90 shadow-lg shadow-primary/20 transition-all hover:scale-105"
                    >
                      <Upload className="w-4 h-4" />
                      <span>Upload</span>
                    </Link>
                  </>
                ) : (
                  <div className="flex items-center gap-3 bg-accent/50 px-4 py-1.5 rounded-full border border-border/50 backdrop-blur-md animate-in fade-in slide-in-from-top-2">
                    <span className="text-sm font-medium mr-2">{selectedPhotos.size} Selected</span>

                    <button onClick={selectAll} className="text-xs hover:underline text-muted-foreground">All</button>
                    <div className="w-px h-3 bg-border" />
                    <button onClick={deselectAll} className="text-xs hover:underline text-muted-foreground">None</button>

                    <div className="w-px h-4 bg-border mx-1" />

                    <button
                      onClick={handleBatchLocationClick}
                      disabled={selectedPhotos.size === 0}
                      className="p-1.5 hover:bg-background rounded-full text-foreground disabled:opacity-50 transition-colors"
                      title="Assign Location"
                    >
                      <MapPin className="w-4 h-4" />
                    </button>

                    <button
                      onClick={handleBatchDelete}
                      disabled={selectedPhotos.size === 0 || deleting}
                      className="p-1.5 hover:bg-red-500/10 hover:text-red-500 rounded-full text-foreground disabled:opacity-50 transition-colors"
                      title="Delete Selected"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>

                    {/* Download Button */}
                    <button
                      onClick={handleBatchDownload}
                      disabled={selectedPhotos.size === 0 || isDownloading}
                      className="p-1.5 hover:bg-green-500/10 hover:text-green-500 rounded-full text-foreground disabled:opacity-50 transition-colors"
                      title="Download Selected"
                    >
                      {isDownloading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Download className="w-4 h-4" />
                      )}
                    </button>

                    <div className="w-px h-4 bg-border mx-1" />

                    {/* Sculpt Story Button */}
                    <button
                      onClick={handleSculptStory}
                      disabled={selectedPhotos.size === 0 || isSculpting}
                      className="flex items-center gap-2 px-3 py-1 bg-gradient-to-r from-indigo-500 to-purple-500 text-white text-xs font-medium rounded-full hover:shadow-lg hover:scale-105 transition-all disabled:opacity-50 disabled:hover:scale-100"
                      title="Sculpt a story from selected photos"
                    >
                      {isSculpting ? (
                        <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        <Wand2 className="w-3 h-3" />
                      )}
                      <span>Sculpt Story</span>
                    </button>

                    <div className="w-px h-4 bg-border mx-1" />

                    <button
                      onClick={toggleSelectionMode}
                      className="p-1 hover:bg-background rounded-full transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Filters Bar - Unified Scrollable Capsule Bar */}
            <div className="mt-4 flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide mask-linear-fade">
              {stats && (
                <CategoryFilter
                  stats={stats}
                  selectedCategory={selectedCategory}
                  onCategoryChange={setSelectedCategory}
                />
              )}

              {/* Divider between categories and locations */}
              {(selectedCategory === "time-location" || selectedCategory === "location-only" || selectedCategory === "all") &&
                locations.length > 0 &&
                Object.keys(photoCountByLocation).length > 0 && (
                  <>
                    <div className="h-6 w-px bg-border/50 mx-2 flex-shrink-0" />

                    <LocationFilter
                      locations={locations}
                      selectedLocationId={selectedLocationId}
                      onLocationChange={setSelectedLocationId}
                      photoCountByLocation={photoCountByLocation}
                    />
                  </>
                )}
            </div>
          </div>
        </div>

        {/* Photo Clusters */}
        <div className="max-w-7xl mx-auto px-8 py-8">
          {userId ? (
            <>
              {/* 渲染所有聚类组 */}
              {photoClusters.map((cluster) => (
                <ClusterSection
                  key={`${cluster.id}-${sortOrder}`}
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

        {/* Magazine View Overlay */}
        {viewMode === 'magazine' && (
          <MagazineView
            photos={filteredPhotos}
            onClose={() => setViewMode('grid')}
          />
        )}

        {/* Photo Detail Modal */}
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

        {/* Batch Delete Confirmation Modal */}
        {showBatchDeleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-card border border-border rounded-xl p-6 shadow-2xl max-w-md w-full mx-4 animate-in fade-in zoom-in duration-200">
              <h3 className="text-lg font-semibold text-foreground mb-2">Delete Photos</h3>
              <p className="text-muted-foreground mb-6">
                Are you sure you want to delete {selectedPhotos.size} photo{selectedPhotos.size > 1 ? "s" : ""}? This action cannot be undone.
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowBatchDeleteConfirm(false)}
                  className="px-4 py-2 text-sm font-medium text-foreground bg-muted hover:bg-muted/80 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmBatchDelete}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors flex items-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
