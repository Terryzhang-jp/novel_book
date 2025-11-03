"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Upload, Trash2, X, MapPin } from "lucide-react";
import type { Photo, PhotoCategory, PhotoStats } from "@/types/storage";
import { CategoryFilter } from "@/components/gallery/category-filter";
import { PhotoGrid } from "@/components/gallery/photo-grid";
import { PhotoDetailModal } from "@/components/photos/photo-detail-modal";
import { BatchLocationAssignment } from "@/components/photos/batch-location-assignment";
import { AppLayout } from "@/components/layout/app-layout";

export default function GalleryPage() {
  const router = useRouter();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [stats, setStats] = useState<PhotoStats | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<PhotoCategory | "all">("all");
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedPhotos, setSelectedPhotos] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [detailPhotoId, setDetailPhotoId] = useState<string | null>(null);
  const [showBatchLocationModal, setShowBatchLocationModal] = useState(false);

  useEffect(() => {
    fetchPhotos();
  }, []);

  const fetchPhotos = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/photos");

      if (!response.ok) {
        if (response.status === 401) {
          router.push("/login");
          return;
        }
        throw new Error("Failed to fetch photos");
      }

      const data = await response.json();
      setPhotos(data.photos);
      setStats(data.stats);
      setUserId(data.userId);
    } catch (error) {
      console.error("Error fetching photos:", error);
    } finally {
      setLoading(false);
    }
  };

  const handlePhotoDelete = async (photoId: string) => {
    try {
      const response = await fetch(`/api/photos/${photoId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete photo");
      }

      // Refresh photos
      await fetchPhotos();
    } catch (error) {
      console.error("Error deleting photo:", error);
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

    try {
      // Delete photos sequentially
      for (const photoId of selectedPhotos) {
        await fetch(`/api/photos/${photoId}`, {
          method: "DELETE",
        });
      }

      // Refresh photos
      await fetchPhotos();
      setSelectedPhotos(new Set());
      setSelectionMode(false);
    } catch (error) {
      console.error("Error deleting photos:", error);
      alert("Failed to delete some photos. Please try again.");
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

    // Refresh photos to show updated location data
    await fetchPhotos();

    // Optionally: clear selection and exit selection mode
    // Commenting this out so users can continue selecting if needed
    // setSelectedPhotos(new Set());
    // setSelectionMode(false);
  };

  const filteredPhotos =
    selectedCategory === "all"
      ? photos
      : photos.filter((photo) => photo.category === selectedCategory);

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
      <div className="border-b border-border bg-card">
        <div className="max-w-7xl mx-auto px-8 py-6">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-3xl font-bold text-foreground">Photo Gallery</h1>
            <div className="flex items-center gap-4">
              {!selectionMode ? (
                <>
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

      {/* Photo Grid */}
      <div className="max-w-7xl mx-auto px-8 py-8">
        {userId ? (
          <PhotoGrid
            photos={filteredPhotos}
            userId={userId}
            onPhotoDelete={handlePhotoDelete}
            selectionMode={selectionMode}
            selectedPhotos={selectedPhotos}
            onPhotoToggle={togglePhotoSelection}
            onPhotoClick={handlePhotoClick}
          />
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
      </div>
    </AppLayout>
  );
}
