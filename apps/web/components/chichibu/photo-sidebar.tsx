/**
 * PhotoSidebar Component
 *
 * Collapsible sidebar showing all photos for quick browsing.
 *
 * Features:
 * - Toggle open/close
 * - Photo thumbnails with user info
 * - Click to focus on map
 * - Sorted by time and location
 * - Highlight selected photo
 */

'use client';

import { useState, useMemo } from 'react';
import Image from 'next/image';
import { ChevronLeft, ChevronRight, X, Calendar, MapPin, Filter } from 'lucide-react';

interface PublicPhotoIndex {
  id: string;
  userId: string;
  userName: string;
  fileName: string;
  dateTime?: string;
  location?: {
    latitude: number;
    longitude: number;
  };
}

interface PhotoSidebarProps {
  photos: PublicPhotoIndex[];
  onPhotoClick: (photoId: string) => void;
  selectedPhotoId?: string | null;
  className?: string;
}

type TimeFilter = 'all' | 'today' | 'week' | 'month';
type GroupBy = 'time' | 'location';

interface PhotoGroup {
  title: string;
  photos: PublicPhotoIndex[];
}

/**
 * Sort photos by time (newest first) and location
 */
function sortPhotos(photos: PublicPhotoIndex[]): PublicPhotoIndex[] {
  return [...photos].sort((a, b) => {
    // Photos with location first
    const aHasLocation = !!a.location;
    const bHasLocation = !!b.location;

    if (aHasLocation && !bHasLocation) return -1;
    if (!aHasLocation && bHasLocation) return 1;

    // Then sort by dateTime (newest first)
    const aTime = a.dateTime ? new Date(a.dateTime).getTime() : 0;
    const bTime = b.dateTime ? new Date(b.dateTime).getTime() : 0;

    if (aTime !== bTime) {
      return bTime - aTime; // Descending (newest first)
    }

    // If same time, sort by location (latitude + longitude)
    if (a.location && b.location) {
      const aLoc = a.location.latitude + a.location.longitude;
      const bLoc = b.location.latitude + b.location.longitude;
      return aLoc - bLoc;
    }

    return 0;
  });
}

/**
 * Filter photos by time range
 */
function filterPhotosByTime(photos: PublicPhotoIndex[], filter: TimeFilter): PublicPhotoIndex[] {
  if (filter === 'all') return photos;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  return photos.filter(photo => {
    if (!photo.dateTime) return false;
    const photoDate = new Date(photo.dateTime);

    switch (filter) {
      case 'today':
        return photoDate >= today;
      case 'week':
        const weekAgo = new Date(today);
        weekAgo.setDate(weekAgo.getDate() - 7);
        return photoDate >= weekAgo;
      case 'month':
        const monthAgo = new Date(today);
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        return photoDate >= monthAgo;
      default:
        return true;
    }
  });
}

/**
 * Group photos by date or location
 */
function groupPhotos(photos: PublicPhotoIndex[], groupBy: GroupBy): PhotoGroup[] {
  if (groupBy === 'time') {
    // Group by date (YYYY-MM-DD)
    const groups = new Map<string, PublicPhotoIndex[]>();

    photos.forEach(photo => {
      if (!photo.dateTime) return;
      const date = new Date(photo.dateTime);
      const key = date.toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });

      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(photo);
    });

    return Array.from(groups.entries()).map(([title, photos]) => ({
      title,
      photos,
    }));
  } else {
    // Group by location (rounded coordinates)
    const groups = new Map<string, PublicPhotoIndex[]>();

    photos.forEach(photo => {
      if (!photo.location) return;
      const key = `${photo.location.latitude.toFixed(2)}, ${photo.location.longitude.toFixed(2)}`;

      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(photo);
    });

    return Array.from(groups.entries()).map(([title, photos]) => ({
      title: `📍 ${title}`,
      photos,
    }));
  }
}

/**
 * Format date for display
 */
function formatDate(dateString?: string): string {
  if (!dateString) return '未知时间';
  const date = new Date(dateString);
  return date.toLocaleDateString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function PhotoSidebar({
  photos,
  onPhotoClick,
  selectedPhotoId,
  className = '',
}: PhotoSidebarProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all');
  const [groupBy, setGroupBy] = useState<GroupBy>('time');

  // Filter and group photos
  const photoGroups = useMemo(() => {
    // Filter by location first
    const withLocation = photos.filter(p => p.location);

    // Apply time filter
    const filtered = filterPhotosByTime(withLocation, timeFilter);

    // Sort
    const sorted = sortPhotos(filtered);

    // Group
    return groupPhotos(sorted, groupBy);
  }, [photos, timeFilter, groupBy]);

  const photoCount = useMemo(() => {
    return photoGroups.reduce((sum, group) => sum + group.photos.length, 0);
  }, [photoGroups]);

  if (!isOpen) {
    // Collapsed state - show toggle button only
    return (
      <div className={`flex-shrink-0 flex items-center ${className}`}>
        <button
          onClick={() => setIsOpen(true)}
          className="bg-card border border-border rounded-l-lg p-3 shadow-md hover:bg-accent transition-colors h-20"
          aria-label="Open photo sidebar"
        >
          <ChevronLeft className="w-5 h-5 text-foreground" />
        </button>
      </div>
    );
  }

  return (
    <div className={`flex-shrink-0 w-80 h-full bg-card border-l border-border shadow-lg flex flex-col ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div>
          <h3 className="font-semibold text-foreground">照片列表</h3>
          <p className="text-xs text-muted-foreground">{photoCount} 张照片</p>
        </div>
        <button
          onClick={() => setIsOpen(false)}
          className="p-1.5 hover:bg-accent rounded transition-colors"
          aria-label="Close sidebar"
        >
          <ChevronRight className="w-5 h-5 text-muted-foreground" />
        </button>
      </div>

      {/* Filters */}
      <div className="p-3 border-b border-border space-y-3">
        {/* Time Filter */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">时间范围</span>
          </div>
          <div className="flex gap-1">
            {[
              { value: 'all', label: '全部' },
              { value: 'today', label: '今天' },
              { value: 'week', label: '本周' },
              { value: 'month', label: '本月' },
            ].map((option) => (
              <button
                key={option.value}
                onClick={() => setTimeFilter(option.value as TimeFilter)}
                className={`flex-1 px-2 py-1 text-xs rounded transition-colors ${
                  timeFilter === option.value
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted hover:bg-muted/80 text-muted-foreground'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* Group By */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">分组方式</span>
          </div>
          <div className="flex gap-1">
            <button
              onClick={() => setGroupBy('time')}
              className={`flex-1 px-2 py-1 text-xs rounded transition-colors flex items-center justify-center gap-1 ${
                groupBy === 'time'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted hover:bg-muted/80 text-muted-foreground'
              }`}
            >
              <Calendar className="w-3 h-3" />
              按时间
            </button>
            <button
              onClick={() => setGroupBy('location')}
              className={`flex-1 px-2 py-1 text-xs rounded transition-colors flex items-center justify-center gap-1 ${
                groupBy === 'location'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted hover:bg-muted/80 text-muted-foreground'
              }`}
            >
              <MapPin className="w-3 h-3" />
              按地点
            </button>
          </div>
        </div>
      </div>

      {/* Photo List - Grouped */}
      <div className="flex-1 overflow-y-auto">
        {photoGroups.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            暂无照片
          </div>
        ) : (
          <div className="p-3 space-y-4">
            {photoGroups.map((group, groupIndex) => (
              <div key={groupIndex}>
                {/* Group Header */}
                <div className="sticky top-0 bg-card z-10 py-2 mb-2">
                  <h4 className="text-xs font-semibold text-muted-foreground">
                    {group.title} ({group.photos.length})
                  </h4>
                </div>

                {/* Photos in Group */}
                <div className="space-y-2">
                  {group.photos.map((photo) => {
                    const isSelected = photo.id === selectedPhotoId;

                    return (
                      <button
                        key={photo.id}
                        onClick={() => onPhotoClick(photo.id)}
                        className={`w-full flex items-start gap-3 p-2 rounded-lg transition-all text-left ${
                          isSelected
                            ? 'bg-primary/10 ring-2 ring-primary'
                            : 'hover:bg-accent'
                        }`}
                      >
                        {/* Thumbnail */}
                        <div className="relative w-20 h-20 flex-shrink-0 bg-muted rounded overflow-hidden">
                          <Image
                            src={photo.fileUrl}
                            alt={photo.fileName}
                            fill
                            className="object-cover"
                            sizes="80px"
                            unoptimized
                          />
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0 py-1">
                          <p className="text-sm font-medium text-foreground truncate mb-1">
                            {photo.userName}
                          </p>
                          <p className="text-xs text-muted-foreground mb-1">
                            {formatDate(photo.dateTime)}
                          </p>
                          {photo.location && (
                            <p className="text-xs text-muted-foreground font-mono truncate">
                              📍 {photo.location.latitude.toFixed(4)}, {photo.location.longitude.toFixed(4)}
                            </p>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer tip */}
      <div className="p-3 border-t border-border bg-muted/50">
        <p className="text-xs text-muted-foreground text-center">
          点击照片在地图上查看位置
        </p>
      </div>
    </div>
  );
}
