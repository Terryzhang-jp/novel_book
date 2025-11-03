/**
 * Location Library Page
 *
 * Main page for managing the user's location library with:
 * - Grid view of all locations
 * - Create new location
 * - Edit existing locations
 * - Delete locations with confirmation
 * - Search and filter
 * - Empty state
 * - Loading state
 *
 * This is part of the photo gallery feature where users can
 * create a reusable library of locations to assign to photos.
 */

'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Plus, Search, MapPin, Trash2, AlertTriangle, Grid3x3, Map } from 'lucide-react';
import { AppLayout } from '@/components/layout/app-layout';
import {
  LocationCard,
  LocationCardSkeleton,
  LocationCardGrid,
} from '@/components/locations/location-card';
import {
  LocationFormModal,
  type LocationFormData,
} from '@/components/locations/location-form';
import type { Location } from '@/types/storage';

/**
 * Delete Confirmation Modal
 */
function DeleteConfirmModal({
  isOpen,
  location,
  onConfirm,
  onCancel,
}: {
  isOpen: boolean;
  location: Location | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!isOpen || !location) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onCancel}
      />

      {/* Modal Content */}
      <div className="relative bg-card border border-border rounded-lg shadow-lg w-full max-w-md p-6">
        <div className="flex items-start gap-4 mb-4">
          <div className="flex-shrink-0 w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertTriangle className="w-6 h-6 text-destructive" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold mb-2">Delete Location?</h3>
            <p className="text-sm text-muted-foreground mb-1">
              Are you sure you want to delete &quot;{location.name}&quot;?
            </p>
            {location.usageCount > 0 && (
              <p className="text-sm text-destructive mt-2">
                Warning: This location is currently used by {location.usageCount}{' '}
                photo{location.usageCount !== 1 ? 's' : ''}. Deleting it will remove
                the location from those photos.
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 border border-input rounded-md text-sm font-medium hover:bg-accent transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-4 py-2 bg-destructive text-destructive-foreground rounded-md text-sm font-medium hover:bg-destructive/90 transition-colors flex items-center gap-2"
          >
            <Trash2 className="w-4 h-4" />
            Delete Location
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Empty State Component
 */
function EmptyState({ onCreateNew }: { onCreateNew: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-6">
        <MapPin className="w-10 h-10 text-primary" />
      </div>
      <h2 className="text-2xl font-bold mb-2">No locations yet</h2>
      <p className="text-muted-foreground text-center max-w-md mb-6">
        Start building your location library to quickly assign locations to your photos.
        You can add places you visit frequently or memorable spots from your travels.
      </p>
      <button
        type="button"
        onClick={onCreateNew}
        className="px-6 py-3 bg-primary text-primary-foreground rounded-md font-medium hover:bg-primary/90 transition-colors flex items-center gap-2"
      >
        <Plus className="w-5 h-5" />
        Create Your First Location
      </button>
    </div>
  );
}

/**
 * Location Library Page
 */
export default function LocationsPage() {
  // Data state
  const [locations, setLocations] = useState<Location[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // UI state
  const [searchQuery, setSearchQuery] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const [deletingLocation, setDeletingLocation] = useState<Location | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  /**
   * Fetch locations from API
   */
  const fetchLocations = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/locations');

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
  };

  // Initial fetch
  useEffect(() => {
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
        loc.address?.formattedAddress?.toLowerCase().includes(query)
    );
  }, [locations, searchQuery]);

  /**
   * Handle create new location
   */
  const handleCreateNew = () => {
    setFormMode('create');
    setEditingLocation(null);
    setIsFormOpen(true);
  };

  /**
   * Handle edit location
   */
  const handleEdit = (location: Location) => {
    setFormMode('edit');
    setEditingLocation(location);
    setIsFormOpen(true);
  };

  /**
   * Handle delete location (show confirmation)
   */
  const handleDeleteClick = (location: Location) => {
    setDeletingLocation(location);
  };

  /**
   * Confirm delete location
   */
  const handleConfirmDelete = async () => {
    if (!deletingLocation) return;

    setIsDeleting(true);

    try {
      const response = await fetch(`/api/locations/${deletingLocation.id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        // Remove from local state
        setLocations((prev) =>
          prev.filter((loc) => loc.id !== deletingLocation.id)
        );
        setDeletingLocation(null);
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to delete location');
      }
    } catch (err) {
      console.error('Failed to delete location:', err);
      setError('Failed to delete location. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  /**
   * Handle save location (create or edit)
   */
  const handleSave = async (data: LocationFormData) => {
    if (formMode === 'create') {
      // Create new location
      const response = await fetch('/api/locations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: data.name,
          coordinates: data.coordinates,
          address: data.address,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create location');
      }

      const result = await response.json();
      setLocations((prev) => [result.location, ...prev]);
    } else {
      // Update existing location
      if (!editingLocation) return;

      const response = await fetch(`/api/locations/${editingLocation.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: data.name,
          coordinates: data.coordinates,
          address: data.address,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update location');
      }

      const result = await response.json();
      setLocations((prev) =>
        prev.map((loc) => (loc.id === result.location.id ? result.location : loc))
      );
    }

    // Close form on success
    setIsFormOpen(false);
    setEditingLocation(null);
  };

  return (
    <AppLayout>
      <div className="min-h-screen bg-background">
        {/* Header */}
        <div className="border-b border-border bg-card">
          <div className="container mx-auto px-4 py-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h1 className="text-3xl font-bold mb-2">Location Library</h1>
                <p className="text-muted-foreground">
                  Manage your saved locations for quick photo assignment
                </p>
              </div>
              <div className="flex items-center gap-3">
                {locations.length > 0 && (
                  <button
                    type="button"
                    onClick={handleCreateNew}
                    className="px-4 py-2 bg-primary text-primary-foreground rounded-md font-medium hover:bg-primary/90 transition-colors flex items-center gap-2"
                  >
                    <Plus className="w-5 h-5" />
                    Add Location
                  </button>
                )}
              </div>
            </div>

            {/* Search Bar */}
            {locations.length > 0 && (
              <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search locations..."
                  className="w-full pl-10 pr-3 py-2 bg-background border border-input rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            )}
          </div>
        </div>

        {/* Main Content */}
        <div className="container mx-auto px-4 py-8">
        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
            <p className="text-sm text-destructive">{error}</p>
            <button
              type="button"
              onClick={() => fetchLocations()}
              className="mt-2 text-sm text-primary hover:underline"
            >
              Try Again
            </button>
          </div>
        )}

        {/* Loading State */}
        {isLoading && (
          <LocationCardGrid>
            {Array.from({ length: 8 }).map((_, i) => (
              <LocationCardSkeleton key={i} />
            ))}
          </LocationCardGrid>
        )}

        {/* Empty State */}
        {!isLoading && locations.length === 0 && !error && (
          <EmptyState onCreateNew={handleCreateNew} />
        )}

        {/* Location Grid */}
        {!isLoading && locations.length > 0 && (
          <>
            {filteredLocations.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground mb-4">
                  No locations match &quot;{searchQuery}&quot;
                </p>
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="text-primary hover:underline"
                >
                  Clear search
                </button>
              </div>
            ) : (
              <>
                <div className="mb-4 text-sm text-muted-foreground">
                  {filteredLocations.length} location{filteredLocations.length !== 1 ? 's' : ''}
                  {searchQuery && ` matching "${searchQuery}"`}
                </div>
                <LocationCardGrid>
                  {filteredLocations.map((location) => (
                    <LocationCard
                      key={location.id}
                      location={location}
                      onEdit={handleEdit}
                      onDelete={handleDeleteClick}
                    />
                  ))}
                </LocationCardGrid>
              </>
            )}
          </>
        )}
      </div>

        {/* Form Modal */}
        <LocationFormModal
          isOpen={isFormOpen}
          mode={formMode}
          initialData={editingLocation || undefined}
          onSave={handleSave}
          onClose={() => {
            setIsFormOpen(false);
            setEditingLocation(null);
          }}
        />

        {/* Delete Confirmation Modal */}
        <DeleteConfirmModal
          isOpen={!!deletingLocation && !isDeleting}
          location={deletingLocation}
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeletingLocation(null)}
        />
      </div>
    </AppLayout>
  );
}
