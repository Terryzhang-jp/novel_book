/**
 * LocationSelector Component
 *
 * A quick selection component that allows users to:
 * - Choose from their location library
 * - See frequently used locations first
 * - Search locations by name
 * - Optionally create a new location
 *
 * This is designed for quick assignment of locations to photos.
 */

'use client';

import { useState, useEffect, useMemo } from 'react';
import { Search, MapPin, Plus, Loader2 } from 'lucide-react';
import type { LocationIndex } from '@/types/storage';

interface LocationSelectorProps {
  onSelect: (locationId: string) => void;
  onCreateNew?: () => void;
  selectedLocationId?: string;
  className?: string;
  maxHeight?: string;
}

/**
 * LocationSelector Component
 *
 * Displays user's location library with search and quick selection.
 */
export function LocationSelector({
  onSelect,
  onCreateNew,
  selectedLocationId,
  className = '',
  maxHeight = '400px',
}: LocationSelectorProps) {
  const [locations, setLocations] = useState<LocationIndex[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  /**
   * Fetch user's locations from the library (including public locations)
   */
  useEffect(() => {
    async function fetchLocations() {
      setIsLoading(true);
      setError(null);

      try {
        // Fetch user's own locations + public locations
        const response = await fetch('/api/locations?include=all');

        if (response.ok) {
          const data = await response.json();
          setLocations(data.locations || []);
        } else {
          const errorData = await response.json();
          setError(errorData.error || 'Failed to load locations');
        }
      } catch (err) {
        console.error('Failed to fetch locations:', err);
        setError('Failed to load locations. Please try again.');
      } finally {
        setIsLoading(false);
      }
    }

    fetchLocations();
  }, []);

  /**
   * Filter locations based on search query
   */
  const filteredLocations = useMemo(() => {
    if (!searchQuery.trim()) {
      return locations;
    }

    const query = searchQuery.toLowerCase();
    return locations.filter(
      (loc) =>
        loc.name.toLowerCase().includes(query) ||
        loc.formattedAddress?.toLowerCase().includes(query)
    );
  }, [locations, searchQuery]);

  /**
   * Render loading state
   */
  if (isLoading) {
    return (
      <div className={`flex items-center justify-center py-12 ${className}`}>
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Loading locations...</p>
        </div>
      </div>
    );
  }

  /**
   * Render error state
   */
  if (error) {
    return (
      <div className={`p-4 ${className}`}>
        <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg text-center">
          <p className="text-sm text-destructive">{error}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-2 text-sm text-primary hover:underline"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  /**
   * Render empty state
   */
  if (locations.length === 0) {
    return (
      <div className={`p-6 text-center ${className}`}>
        <MapPin className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
        <h3 className="text-lg font-semibold mb-2">No locations yet</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Create your first location to get started
        </p>
        {onCreateNew && (
          <button
            type="button"
            onClick={onCreateNew}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4 inline-block mr-2" />
            Create New Location
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={`flex flex-col ${className}`}>
      {/* Search Input */}
      <div className="p-4 border-b border-border">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search locations..."
            className="w-full pl-10 pr-3 py-2 bg-background border border-input rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      {/* Location List */}
      <div
        className="flex-1 overflow-y-auto"
        style={{ maxHeight }}
      >
        {filteredLocations.length === 0 ? (
          <div className="p-6 text-center">
            <p className="text-sm text-muted-foreground">
              No locations match "{searchQuery}"
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filteredLocations.map((location) => (
              <button
                key={location.id}
                type="button"
                onClick={() => onSelect(location.id)}
                className={`w-full p-4 text-left transition-colors hover:bg-accent ${
                  selectedLocationId === location.id ? 'bg-accent' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <MapPin className="w-4 h-4 text-primary flex-shrink-0" />
                      <h4 className="font-medium text-sm truncate">{location.name}</h4>
                    </div>
                    {location.formattedAddress && (
                      <p className="text-xs text-muted-foreground line-clamp-1">
                        {location.formattedAddress}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      {location.coordinates.latitude.toFixed(4)},{' '}
                      {location.coordinates.longitude.toFixed(4)}
                    </p>
                  </div>

                  {/* Badges */}
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    {location.isPublic && (
                      <span className="text-xs px-2 py-1 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-full font-medium">
                        Public
                      </span>
                    )}
                    {location.usageCount > 0 && (
                      <span className="text-xs px-2 py-1 bg-primary/10 text-primary rounded-full">
                        Used {location.usageCount}×
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Create New Button */}
      {onCreateNew && (
        <div className="p-4 border-t border-border">
          <button
            type="button"
            onClick={onCreateNew}
            className="w-full px-4 py-2 bg-muted text-foreground rounded-md text-sm font-medium hover:bg-accent transition-colors flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add New Location
          </button>
        </div>
      )}
    </div>
  );
}
