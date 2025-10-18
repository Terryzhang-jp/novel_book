/**
 * LocationAssignment Component
 *
 * Manages location assignment for a single photo with:
 * - Display current location (from EXIF or library)
 * - Quick selection from location library
 * - Create new location on-the-fly
 * - Remove location assignment
 * - Visual indication of location source (EXIF vs manual)
 *
 * This component is integrated into the photo details page.
 */

'use client';

import { useState } from 'react';
import { MapPin, Plus, X, Edit, Loader2, Image as ImageIcon } from 'lucide-react';
import { LocationSelector } from '@/components/maps/location-selector';
import {
  LocationFormModal,
  type LocationFormData,
} from '@/components/locations/location-form';
import type { Photo } from '@/types/storage';

interface LocationAssignmentProps {
  photo: Photo;
  onLocationChange?: (updatedPhoto: Photo) => void;
  className?: string;
}

/**
 * LocationAssignment Component
 *
 * Provides a complete UI for managing a photo's location assignment.
 */
export function LocationAssignment({
  photo,
  onLocationChange,
  className = '',
}: LocationAssignmentProps) {
  // UI state
  const [isExpanded, setIsExpanded] = useState(false);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Current location info
  const hasExifLocation = !!(
    photo.metadata?.location?.latitude && photo.metadata?.location?.longitude
  );
  const hasLibraryLocation = !!photo.locationId;
  const locationSource = photo.metadata?.location?.source || 'exif';

  /**
   * Assign location from library to photo
   */
  const handleAssignLocation = async (locationId: string) => {
    setIsAssigning(true);
    setError(null);

    try {
      const response = await fetch(`/api/photos/${photo.id}/location`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locationId }),
      });

      if (response.ok) {
        const data = await response.json();
        onLocationChange?.(data.photo);
        setIsExpanded(false);
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to assign location');
      }
    } catch (err) {
      console.error('Failed to assign location:', err);
      setError('Failed to assign location. Please try again.');
    } finally {
      setIsAssigning(false);
    }
  };

  /**
   * Remove location assignment from photo
   */
  const handleRemoveLocation = async () => {
    setIsRemoving(true);
    setError(null);

    try {
      const response = await fetch(`/api/photos/${photo.id}/location`, {
        method: 'DELETE',
      });

      if (response.ok) {
        const data = await response.json();
        onLocationChange?.(data.photo);
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to remove location');
      }
    } catch (err) {
      console.error('Failed to remove location:', err);
      setError('Failed to remove location. Please try again.');
    } finally {
      setIsRemoving(false);
    }
  };

  /**
   * Create new location and assign to photo
   */
  const handleCreateAndAssign = async (data: LocationFormData) => {
    // First create the location
    const createResponse = await fetch('/api/locations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: data.name,
        coordinates: data.coordinates,
        address: data.address,
      }),
    });

    if (!createResponse.ok) {
      const errorData = await createResponse.json();
      throw new Error(errorData.error || 'Failed to create location');
    }

    const createResult = await createResponse.json();
    const newLocationId = createResult.location.id;

    // Then assign it to the photo
    const assignResponse = await fetch(`/api/photos/${photo.id}/location`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locationId: newLocationId }),
    });

    if (!assignResponse.ok) {
      const errorData = await assignResponse.json();
      throw new Error(errorData.error || 'Failed to assign location');
    }

    const assignResult = await assignResponse.json();
    onLocationChange?.(assignResult.photo);
    setIsCreatingNew(false);
    setIsExpanded(false);
  };

  /**
   * Render location source badge
   */
  const renderSourceBadge = () => {
    if (locationSource === 'exif') {
      return (
        <span className="text-xs px-2 py-0.5 bg-blue-500/10 text-blue-500 rounded-full">
          EXIF
        </span>
      );
    }
    if (locationSource === 'manual') {
      return (
        <span className="text-xs px-2 py-0.5 bg-purple-500/10 text-purple-500 rounded-full">
          Manual
        </span>
      );
    }
    if (locationSource === 'location-library') {
      return (
        <span className="text-xs px-2 py-0.5 bg-green-500/10 text-green-500 rounded-full">
          Library
        </span>
      );
    }
    return null;
  };

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MapPin className="w-5 h-5 text-muted-foreground" />
          <h3 className="font-medium">Location</h3>
        </div>
        {renderSourceBadge()}
      </div>

      {/* Current Location Display */}
      {hasLibraryLocation || hasExifLocation ? (
        <div className="p-3 bg-muted rounded-lg">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              {hasExifLocation && (
                <>
                  <p className="text-sm font-medium mb-1">
                    Location from EXIF
                  </p>
                  <p className="text-xs text-muted-foreground font-mono">
                    {photo.metadata?.location?.latitude?.toFixed(6)},{' '}
                    {photo.metadata?.location?.longitude?.toFixed(6)}
                  </p>
                </>
              )}
              {hasLibraryLocation && locationSource === 'location-library' && (
                <p className="text-sm text-muted-foreground mt-1">
                  From location library
                </p>
              )}
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                type="button"
                onClick={() => setIsExpanded(!isExpanded)}
                className="p-1.5 hover:bg-accent rounded-md transition-colors"
                aria-label="Change location"
              >
                <Edit className="w-4 h-4 text-muted-foreground" />
              </button>
              {hasLibraryLocation && (
                <button
                  type="button"
                  onClick={handleRemoveLocation}
                  disabled={isRemoving}
                  className="p-1.5 hover:bg-destructive/10 rounded-md transition-colors disabled:opacity-50"
                  aria-label="Remove location"
                >
                  {isRemoving ? (
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                  ) : (
                    <X className="w-4 h-4 text-destructive" />
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="p-4 border-2 border-dashed border-border rounded-lg text-center">
          <p className="text-sm text-muted-foreground mb-3">No location assigned</p>
          <button
            type="button"
            onClick={() => setIsExpanded(true)}
            className="px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <MapPin className="w-4 h-4 inline-block mr-1" />
            Assign Location
          </button>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* Expanded Location Selector */}
      {isExpanded && (
        <div className="border border-border rounded-lg overflow-hidden">
          <div className="p-4 bg-muted border-b border-border">
            <div className="flex items-center justify-between">
              <h4 className="font-medium">Choose from Library</h4>
              <button
                type="button"
                onClick={() => setIsExpanded(false)}
                className="p-1 hover:bg-accent rounded-md transition-colors"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {isAssigning ? (
            <div className="p-8 text-center">
              <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Assigning location...</p>
            </div>
          ) : (
            <LocationSelector
              onSelect={handleAssignLocation}
              onCreateNew={() => setIsCreatingNew(true)}
              selectedLocationId={photo.locationId}
              maxHeight="300px"
            />
          )}
        </div>
      )}

      {/* Create New Location Modal */}
      <LocationFormModal
        isOpen={isCreatingNew}
        mode="create"
        onSave={handleCreateAndAssign}
        onClose={() => setIsCreatingNew(false)}
      />
    </div>
  );
}

/**
 * LocationAssignmentCompact Component
 *
 * A compact version of LocationAssignment for use in photo cards/thumbnails.
 */
export function LocationAssignmentCompact({
  photo,
  className = '',
}: {
  photo: Photo;
  className?: string;
}) {
  const hasExifLocation = !!(
    photo.metadata?.location?.latitude && photo.metadata?.location?.longitude
  );
  const hasLibraryLocation = !!photo.locationId;

  if (!hasExifLocation && !hasLibraryLocation) {
    return null;
  }

  const locationSource = photo.metadata?.location?.source || 'exif';

  return (
    <div className={`flex items-center gap-1.5 text-xs ${className}`}>
      <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
      <span className="text-muted-foreground truncate">
        Location
      </span>
      {locationSource === 'location-library' && (
        <span className="px-1.5 py-0.5 bg-green-500/10 text-green-500 rounded text-[10px]">
          Library
        </span>
      )}
    </div>
  );
}
