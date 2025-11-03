"use client";

import Masonry from "react-masonry-css";
import type { Photo } from "@/types/storage";
import { PhotoCard } from "./photo-card";

interface PhotoGridProps {
  photos: Photo[];
  userId: string;
  onPhotoDelete?: (photoId: string) => void;
  selectionMode?: boolean;
  selectedPhotos?: Set<string>;
  onPhotoToggle?: (photoId: string) => void;
  onPhotoClick?: (photoId: string) => void;
}

export function PhotoGrid({
  photos,
  userId,
  onPhotoDelete,
  selectionMode = false,
  selectedPhotos = new Set(),
  onPhotoToggle,
  onPhotoClick,
}: PhotoGridProps) {
  const breakpointColumns = {
    default: 4,
    1440: 3,
    1024: 2,
    640: 1,
  };

  if (photos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="text-6xl mb-4">📷</div>
        <h3 className="text-xl font-semibold text-foreground mb-2">No photos yet</h3>
        <p className="text-muted-foreground mb-6">
          Upload your first photo to get started
        </p>
      </div>
    );
  }

  return (
    <Masonry
      breakpointCols={breakpointColumns}
      className="flex gap-4 -ml-4"
      columnClassName="pl-4 bg-clip-padding"
    >
      {photos.map((photo) => (
        <div key={photo.id} className="mb-4">
          <PhotoCard
            photo={photo}
            userId={userId}
            onDelete={onPhotoDelete}
            selectionMode={selectionMode}
            isSelected={selectedPhotos.has(photo.id)}
            onToggleSelect={onPhotoToggle}
            onClick={onPhotoClick}
          />
        </div>
      ))}
    </Masonry>
  );
}
