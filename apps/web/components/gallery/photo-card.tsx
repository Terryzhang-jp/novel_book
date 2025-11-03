"use client";

import { useState } from "react";
import type { Photo } from "@/types/storage";
import Image from "next/image";
import { Trash2, Check } from "lucide-react";

interface PhotoCardProps {
  photo: Photo;
  userId: string;
  onDelete?: (photoId: string) => void;
  selectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (photoId: string) => void;
  onClick?: (photoId: string) => void;
}

export function PhotoCard({
  photo,
  userId,
  onDelete,
  selectionMode = false,
  isSelected = false,
  onToggleSelect,
  onClick,
}: PhotoCardProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const imageUrl = photo.fileUrl;

  const formatDate = (dateString?: string) => {
    if (!dateString) return null;
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const formatLocation = (location?: { latitude: number; longitude: number }) => {
    if (!location) return null;
    return `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`;
  };

  const handleDelete = async () => {
    if (!onDelete) return;

    setIsDeleting(true);
    try {
      await onDelete(photo.id);
    } catch (error) {
      console.error("Failed to delete photo:", error);
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const handleClick = () => {
    if (selectionMode && onToggleSelect) {
      onToggleSelect(photo.id);
    } else if (onClick) {
      onClick(photo.id);
    }
  };

  return (
    <div
      className={`group relative bg-card rounded-lg overflow-hidden shadow-md transition-all duration-200 ${
        selectionMode || onClick ? "cursor-pointer" : "hover:shadow-xl hover:-translate-y-1"
      } ${isSelected ? "ring-4 ring-primary" : ""}`}
      onClick={handleClick}
    >
      {/* Image */}
      <div className="relative aspect-square bg-muted">
        <Image
          src={imageUrl}
          alt={photo.fileName}
          fill
          className="object-cover"
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
        />
      </div>

      {/* Metadata */}
      <div className="p-3 space-y-1">
        {photo.metadata?.dateTime && (
          <div className="flex items-center gap-2 text-sm text-foreground">
            <span>⏰</span>
            <span>{formatDate(photo.metadata.dateTime)}</span>
          </div>
        )}
        {photo.metadata?.location && (
          <div className="flex items-center gap-2 text-sm text-foreground">
            <span>📍</span>
            <span className="truncate">{formatLocation(photo.metadata.location)}</span>
          </div>
        )}
        {!photo.metadata?.dateTime && !photo.metadata?.location && (
          <div className="text-sm text-muted-foreground">No metadata</div>
        )}
      </div>

      {/* Selection Mode Checkbox */}
      {selectionMode && (
        <div className="absolute top-2 right-2">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
              isSelected
                ? "bg-primary text-primary-foreground"
                : "bg-background/80 text-foreground border-2 border-border"
            }`}
          >
            {isSelected && <Check className="w-5 h-5" />}
          </div>
        </div>
      )}

      {/* Delete button (only in non-selection mode) */}
      {onDelete && !selectionMode && (
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
          {!showDeleteConfirm ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowDeleteConfirm(true);
              }}
              className="p-2 bg-destructive text-destructive-foreground rounded-full shadow-lg hover:bg-destructive/90 transition-colors"
              title="Delete photo"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          ) : (
            <div className="flex gap-1 bg-background rounded-lg shadow-lg p-1">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete();
                }}
                disabled={isDeleting}
                className="px-3 py-1 bg-destructive text-destructive-foreground rounded text-sm hover:bg-destructive/90 disabled:opacity-50"
              >
                {isDeleting ? "..." : "Yes"}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowDeleteConfirm(false);
                }}
                disabled={isDeleting}
                className="px-3 py-1 bg-muted text-foreground rounded text-sm hover:bg-accent"
              >
                No
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
