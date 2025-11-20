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
  fileUrl: string;
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
      <div className={`flex-shrink-0 flex items-start ${className}`}>
        <button
          onClick={() => setIsOpen(true)}
          className="group flex items-center gap-2 bg-background/80 backdrop-blur-md border border-border/50 rounded-full pl-4 pr-2 py-2 shadow-lg hover:bg-background hover:scale-105 transition-all"
          aria-label="Open photo sidebar"
        >
          <span className="text-sm font-medium text-foreground">Explore Photos</span>
          <div className="p-1 bg-primary/10 rounded-full group-hover:bg-primary/20 transition-colors">
            <ChevronRight className="w-4 h-4 text-primary" />
          </div>
        </button>
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-[40vh] md:h-[calc(100vh-160px)] w-full md:w-96 bg-background/80 backdrop-blur-xl border border-border/50 shadow-2xl rounded-2xl overflow-hidden transition-all duration-300 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border/50 bg-background/40 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-primary/10 rounded-lg">
            <MapPin className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h3 className="font-serif font-bold text-foreground text-base leading-none">Exploration</h3>
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mt-1">{photoCount} Moments</p>
          </div>
        </div>
        <button
          onClick={() => setIsOpen(false)}
          className="p-2 hover:bg-muted/50 rounded-full transition-colors group"
          aria-label="Close sidebar"
        >
          <ChevronLeft className="w-5 h-5 text-muted-foreground group-hover:text-foreground" />
        </button>
      </div>

      {/* Filters */}
      <div className="p-4 border-b border-border/50 space-y-4 bg-background/20">
        {/* Time Filter */}
        <div>
          <div className="flex gap-1 p-1 bg-muted/50 rounded-lg">
            {[
              { value: 'all', label: 'All' },
              { value: 'today', label: 'Today' },
              { value: 'week', label: 'Week' },
              { value: 'month', label: 'Month' },
            ].map((option) => (
              <button
                key={option.value}
                onClick={() => setTimeFilter(option.value as TimeFilter)}
                className={`flex-1 px-2 py-1.5 text-[10px] md:text-xs font-medium rounded-md transition-all ${timeFilter === option.value
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
                  }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* Group By */}
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Group By</span>
          <div className="flex gap-2">
            <button
              onClick={() => setGroupBy('time')}
              className={`flex items-center gap-1.5 px-2 py-1 rounded-md transition-colors text-xs font-medium ${groupBy === 'time'
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-muted'
                }`}
              title="Group by Time"
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Time</span>
            </button>
            <button
              onClick={() => setGroupBy('location')}
              className={`flex items-center gap-1.5 px-2 py-1 rounded-md transition-colors text-xs font-medium ${groupBy === 'location'
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-muted'
                }`}
              title="Group by Location"
            >
              <MapPin className="w-3.5 h-3.5" />
              <span>Location</span>
            </button>
          </div>
        </div>
      </div>

      {/* Photo List - Grouped */}
      <div className="flex-1 overflow-y-auto scrollbar-hide bg-background/10">
        {photoGroups.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-center p-6">
            <Filter className="w-8 h-8 text-muted-foreground/30 mb-2" />
            <p className="text-sm text-muted-foreground">No photos found</p>
          </div>
        ) : (
          <div className="p-3 space-y-6">
            {photoGroups.map((group, groupIndex) => (
              <div key={groupIndex}>
                {/* Group Header */}
                <div className="sticky top-0 bg-background/95 backdrop-blur-md z-10 py-2 mb-2 px-2 border-b border-border/30 shadow-sm -mx-3 px-6">
                  <h4 className="text-[10px] font-bold text-primary uppercase tracking-widest">
                    {group.title}
                  </h4>
                </div>

                {/* Photos in Group */}
                <div className="space-y-3">
                  {group.photos.map((photo) => {
                    const isSelected = photo.id === selectedPhotoId;

                    return (
                      <button
                        key={photo.id}
                        onClick={() => onPhotoClick(photo.id)}
                        className={`group w-full flex items-start gap-3 p-2 rounded-xl transition-all text-left border ${isSelected
                            ? 'bg-primary/5 border-primary/30 shadow-sm'
                            : 'bg-card/40 border-transparent hover:bg-card/80 hover:border-border/50 hover:shadow-sm'
                          }`}
                      >
                        {/* Thumbnail */}
                        <div className="relative w-14 h-14 flex-shrink-0 bg-muted rounded-lg overflow-hidden shadow-sm group-hover:shadow-md transition-shadow">
                          <Image
                            src={photo.fileUrl}
                            alt={photo.fileName}
                            fill
                            className="object-cover transition-transform duration-500 group-hover:scale-110"
                            sizes="56px"
                            unoptimized
                          />
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0 py-0.5">
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-sm font-serif font-bold text-foreground truncate pr-2">
                              {photo.userName}
                            </p>
                            <span className="text-[10px] text-muted-foreground font-mono flex-shrink-0">
                              {new Date(photo.dateTime || '').toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>

                          {photo.location && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <MapPin className="w-3 h-3 flex-shrink-0 text-primary/50" />
                              <span className="truncate font-light">
                                {photo.location.latitude.toFixed(3)}, {photo.location.longitude.toFixed(3)}
                              </span>
                            </div>
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
    </div>
  );
}
