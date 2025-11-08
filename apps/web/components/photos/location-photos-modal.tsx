/**
 * LocationPhotosModal Component
 *
 * 显示某个地理位置的所有照片
 * - 位置信息展示（坐标、照片数量）
 * - 瀑布流布局展示照片
 * - 点击照片查看大图（lightbox模式）
 * - 支持键盘快捷键（Esc关闭）
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { X, MapPin, Image as ImageIcon, Calendar, User } from 'lucide-react';
import type { PhotoLocation } from '@/components/maps/photo-map';
import { PublicPhotoDetailModal } from './public-photo-detail-modal';

interface LocationPhotosModalProps {
  isOpen: boolean;
  location: PhotoLocation | null;
  onClose: () => void;
}

/**
 * LocationPhotosModal Component
 *
 * 瀑布流展示某个位置的所有照片
 */
export function LocationPhotosModal({
  isOpen,
  location,
  onClose,
}: LocationPhotosModalProps) {
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null);

  /**
   * Handle keyboard shortcuts
   */
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !selectedPhotoId) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, selectedPhotoId, onClose]);

  if (!isOpen || !location) return null;

  const photos = location.photos;
  const photoCount = photos.length;

  // Extract photo metadata
  const getPhotoDateTime = (photo: any): string | undefined => {
    if ('metadata' in photo) {
      return photo.metadata?.dateTime;
    }
    return photo.dateTime;
  };

  const getUserName = (photo: any): string => {
    return photo.userName || 'Anonymous';
  };

  return (
    <>
      <div className="fixed inset-0 z-[9999] bg-background/95 backdrop-blur-sm">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="fixed top-4 right-4 z-[10000] p-2 bg-card border border-border rounded-full hover:bg-accent transition-colors"
          aria-label="Close"
        >
          <X className="w-6 h-6" />
        </button>

        {/* Content */}
        <div className="h-full overflow-y-auto">
          <div className="container mx-auto px-4 py-20 max-w-7xl">
            {/* Location Header */}
            <div className="mb-8 text-center">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-card border border-border rounded-full mb-3">
                <MapPin className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium">
                  {location.latitude.toFixed(6)}°N, {location.longitude.toFixed(6)}°E
                </span>
              </div>

              <h2 className="text-3xl font-bold text-foreground mb-2">
                该位置的所有照片
              </h2>

              <p className="text-muted-foreground flex items-center justify-center gap-2">
                <ImageIcon className="w-4 h-4" />
                共 {photoCount} 张照片
              </p>
            </div>

            {/* Masonry Grid Layout - 使用CSS Grid实现瀑布流 */}
            <div
              className="grid gap-4"
              style={{
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gridAutoFlow: 'dense',
              }}
            >
              {photos.map((photo, index) => {
                const photoDateTime = getPhotoDateTime(photo);
                const userName = getUserName(photo);

                return (
                  <div
                    key={photo.id}
                    className="group relative bg-card border border-border rounded-lg overflow-hidden hover:shadow-xl transition-all duration-300 cursor-pointer"
                    onClick={() => setSelectedPhotoId(photo.id)}
                  >
                    {/* Photo Image */}
                    <div className="relative aspect-[4/3] bg-muted">
                      <Image
                        src={photo.fileUrl}
                        alt={photo.fileName}
                        fill
                        className="object-cover group-hover:scale-105 transition-transform duration-300"
                        sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                        unoptimized
                      />

                      {/* Hover Overlay */}
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-300" />

                      {/* Photo Number Badge */}
                      <div className="absolute top-2 left-2 px-2 py-1 bg-black/60 backdrop-blur-sm text-white text-xs font-semibold rounded">
                        #{index + 1}
                      </div>
                    </div>

                    {/* Photo Info */}
                    <div className="p-3 space-y-2">
                      {/* Date Time */}
                      {photoDateTime && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Calendar className="w-3 h-3" />
                          <span>
                            {new Date(photoDateTime).toLocaleDateString('zh-CN', {
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                      )}

                      {/* User Name */}
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <User className="w-3 h-3" />
                        <span>{userName}</span>
                      </div>

                      {/* File Name */}
                      <div className="text-xs text-muted-foreground truncate font-mono">
                        {photo.fileName}
                      </div>
                    </div>

                    {/* Click Hint (on hover) */}
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
                      <div className="px-4 py-2 bg-white/90 dark:bg-black/90 rounded-full text-sm font-semibold shadow-lg">
                        点击查看详情
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Empty State */}
            {photoCount === 0 && (
              <div className="text-center py-20">
                <ImageIcon className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">该位置没有照片</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Photo Detail Modal (Lightbox) */}
      <PublicPhotoDetailModal
        isOpen={!!selectedPhotoId}
        photoId={selectedPhotoId}
        onClose={() => setSelectedPhotoId(null)}
      />
    </>
  );
}
