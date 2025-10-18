/**
 * LocationCard Component
 *
 * Displays a single location from the user's location library with:
 * - Location name and address
 * - Coordinates
 * - Usage count badge
 * - Edit and Delete actions
 * - Visual preview on hover
 *
 * Used in the location library management page.
 */

'use client';

import { useState } from 'react';
import { MapPin, Edit, Trash2, MoreVertical } from 'lucide-react';
import type { Location } from '@/types/storage';

interface LocationCardProps {
  location: Location;
  onEdit?: (location: Location) => void;
  onDelete?: (location: Location) => void;
  onClick?: (location: Location) => void;
  className?: string;
}

/**
 * LocationCard Component
 *
 * A card component that displays location information in a visually
 * appealing format with action buttons.
 */
export function LocationCard({
  location,
  onEdit,
  onDelete,
  onClick,
  className = '',
}: LocationCardProps) {
  const [showActions, setShowActions] = useState(false);

  /**
   * Format the last used date for display
   */
  const formatLastUsed = (dateString?: string): string => {
    if (!dateString) return 'Never used';

    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Used today';
    if (diffDays === 1) return 'Used yesterday';
    if (diffDays < 7) return `Used ${diffDays} days ago`;
    if (diffDays < 30) return `Used ${Math.floor(diffDays / 7)} weeks ago`;
    if (diffDays < 365) return `Used ${Math.floor(diffDays / 30)} months ago`;
    return date.toLocaleDateString();
  };

  /**
   * Handle card click - only if onClick is provided and not clicking action buttons
   */
  const handleCardClick = (e: React.MouseEvent) => {
    // Don't trigger card click if clicking on action buttons
    if ((e.target as HTMLElement).closest('.action-buttons')) {
      return;
    }

    if (onClick) {
      onClick(location);
    }
  };

  /**
   * Handle edit button click
   */
  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onEdit) {
      onEdit(location);
    }
  };

  /**
   * Handle delete button click
   */
  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onDelete) {
      onDelete(location);
    }
  };

  return (
    <div
      onClick={handleCardClick}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
      className={`
        group relative bg-card border border-border rounded-lg p-4
        transition-all duration-200
        ${onClick ? 'cursor-pointer hover:shadow-md hover:border-primary/50' : ''}
        ${className}
      `}
    >
      {/* Header with icon and name */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          {/* Location Icon */}
          <div className="flex-shrink-0 mt-0.5">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <MapPin className="w-5 h-5 text-primary" />
            </div>
          </div>

          {/* Location Info */}
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-foreground mb-1 truncate">
              {location.name}
            </h3>
            {location.address?.formattedAddress && (
              <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                {location.address.formattedAddress}
              </p>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className={`
          action-buttons flex items-center gap-1 flex-shrink-0
          transition-opacity duration-200
          ${showActions ? 'opacity-100' : 'opacity-0 md:opacity-0'}
        `}>
          {onEdit && (
            <button
              type="button"
              onClick={handleEdit}
              className="p-2 hover:bg-accent rounded-md transition-colors"
              aria-label="Edit location"
            >
              <Edit className="w-4 h-4 text-muted-foreground" />
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={handleDelete}
              className="p-2 hover:bg-destructive/10 rounded-md transition-colors"
              aria-label="Delete location"
            >
              <Trash2 className="w-4 h-4 text-destructive" />
            </button>
          )}
        </div>
      </div>

      {/* Coordinates */}
      <div className="mb-3">
        <p className="text-xs text-muted-foreground font-mono">
          {location.coordinates.latitude.toFixed(6)}, {location.coordinates.longitude.toFixed(6)}
        </p>
      </div>

      {/* Footer with usage stats */}
      <div className="flex items-center justify-between gap-3 pt-3 border-t border-border">
        {/* Usage Count */}
        <div className="flex items-center gap-2">
          {location.usageCount > 0 ? (
            <span className="text-xs px-2.5 py-1 bg-primary/10 text-primary rounded-full font-medium">
              Used {location.usageCount}×
            </span>
          ) : (
            <span className="text-xs px-2.5 py-1 bg-muted text-muted-foreground rounded-full">
              Not used yet
            </span>
          )}
        </div>

        {/* Last Used */}
        <p className="text-xs text-muted-foreground">
          {formatLastUsed(location.lastUsedAt)}
        </p>
      </div>

      {/* Hover Effect Indicator */}
      {onClick && (
        <div className="absolute inset-0 rounded-lg border-2 border-primary opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
      )}
    </div>
  );
}

/**
 * LocationCardSkeleton Component
 *
 * Loading skeleton for LocationCard
 */
export function LocationCardSkeleton({ className = '' }: { className?: string }) {
  return (
    <div className={`bg-card border border-border rounded-lg p-4 animate-pulse ${className}`}>
      {/* Header skeleton */}
      <div className="flex items-start gap-3 mb-3">
        <div className="w-10 h-10 rounded-full bg-muted" />
        <div className="flex-1">
          <div className="h-5 bg-muted rounded w-3/4 mb-2" />
          <div className="h-4 bg-muted rounded w-full mb-1" />
          <div className="h-4 bg-muted rounded w-2/3" />
        </div>
      </div>

      {/* Coordinates skeleton */}
      <div className="h-3 bg-muted rounded w-1/2 mb-3" />

      {/* Footer skeleton */}
      <div className="flex items-center justify-between pt-3 border-t border-border">
        <div className="h-6 bg-muted rounded-full w-20" />
        <div className="h-3 bg-muted rounded w-24" />
      </div>
    </div>
  );
}

/**
 * LocationCardGrid Component
 *
 * Responsive grid layout for LocationCard components
 */
export function LocationCardGrid({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`
        grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4
        gap-4
        ${className}
      `}
    >
      {children}
    </div>
  );
}
