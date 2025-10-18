/**
 * LocationForm Component
 *
 * A comprehensive form for creating and editing locations with:
 * - Name input with validation
 * - Location picker (map + Google Maps URL)
 * - Address display from reverse geocoding
 * - Form validation
 * - Loading states
 * - Error handling
 *
 * Supports both create and edit modes.
 */

'use client';

import { useState, useEffect } from 'react';
import { Save, X, Loader2, MapPin } from 'lucide-react';
import { LocationPicker } from '@/components/maps/location-picker';
import type { Location } from '@/types/storage';
import type { LatLng, GeocodingResult } from '@/lib/maps/types';

interface LocationFormProps {
  mode: 'create' | 'edit';
  initialData?: Location;
  onSave: (data: LocationFormData) => Promise<void>;
  onCancel: () => void;
  className?: string;
}

export interface LocationFormData {
  name: string;
  coordinates: LatLng;
  address?: GeocodingResult;
}

/**
 * LocationForm Component
 *
 * Handles the complete flow of creating or editing a location,
 * including location selection via map or URL and form validation.
 */
export function LocationForm({
  mode,
  initialData,
  onSave,
  onCancel,
  className = '',
}: LocationFormProps) {
  // Form state
  const [name, setName] = useState(initialData?.name || '');
  const [selectedLocation, setSelectedLocation] = useState<{
    coordinates: LatLng;
    address?: GeocodingResult;
  } | null>(
    initialData
      ? {
          coordinates: initialData.coordinates,
          address: initialData.address,
        }
      : null
  );

  // UI state
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);

  /**
   * Validate form before submission
   */
  const validateForm = (): boolean => {
    let isValid = true;

    // Validate name
    if (!name.trim()) {
      setNameError('Location name is required');
      isValid = false;
    } else if (name.trim().length < 2) {
      setNameError('Location name must be at least 2 characters');
      isValid = false;
    } else if (name.trim().length > 100) {
      setNameError('Location name must be less than 100 characters');
      isValid = false;
    } else {
      setNameError(null);
    }

    // Validate location selection
    if (!selectedLocation) {
      setError('Please select a location on the map or paste a Google Maps link');
      isValid = false;
    }

    return isValid;
  };

  /**
   * Handle location selection from LocationPicker
   */
  const handleLocationSelect = (location: {
    coordinates: LatLng;
    address?: GeocodingResult;
  }) => {
    setSelectedLocation(location);
    setError(null);

    // Auto-fill name from address if in create mode and name is empty
    if (mode === 'create' && !name && location.address) {
      // Try to extract a meaningful name from the address
      const addressParts = location.address.formattedAddress.split(',');
      const suggestedName = addressParts[0]?.trim() || '';
      if (suggestedName) {
        setName(suggestedName);
      }
    }
  };

  /**
   * Handle name change
   */
  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setName(e.target.value);
    if (nameError && e.target.value.trim()) {
      setNameError(null);
    }
  };

  /**
   * Handle form submission
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    if (!selectedLocation) {
      return; // Should be caught by validation
    }

    setIsSaving(true);
    setError(null);

    try {
      await onSave({
        name: name.trim(),
        coordinates: selectedLocation.coordinates,
        address: selectedLocation.address,
      });
    } catch (err) {
      console.error('Failed to save location:', err);
      setError(
        err instanceof Error ? err.message : 'Failed to save location. Please try again.'
      );
    } finally {
      setIsSaving(false);
    }
  };

  /**
   * Handle cancel
   */
  const handleCancel = () => {
    if (isSaving) return;
    onCancel();
  };

  return (
    <form onSubmit={handleSubmit} className={`space-y-6 ${className}`}>
      {/* Form Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">
          {mode === 'create' ? 'Add New Location' : 'Edit Location'}
        </h2>
        <button
          type="button"
          onClick={handleCancel}
          disabled={isSaving}
          className="p-2 hover:bg-accent rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label="Cancel"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Error Message */}
      {error && (
        <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* Location Name Input */}
      <div className="space-y-2">
        <label htmlFor="location-name" className="block text-sm font-medium">
          Location Name <span className="text-destructive">*</span>
        </label>
        <input
          id="location-name"
          type="text"
          value={name}
          onChange={handleNameChange}
          placeholder="e.g., Eiffel Tower, Central Park, My Favorite Cafe"
          disabled={isSaving}
          className={`
            w-full px-3 py-2 bg-background border rounded-md text-sm
            focus:outline-none focus:ring-2 focus:ring-ring
            disabled:opacity-50 disabled:cursor-not-allowed
            ${nameError ? 'border-destructive' : 'border-input'}
          `}
          maxLength={100}
        />
        {nameError && (
          <p className="text-sm text-destructive">{nameError}</p>
        )}
        <p className="text-xs text-muted-foreground">
          {name.length}/100 characters
        </p>
      </div>

      {/* Location Picker */}
      <div className="space-y-2">
        <label className="block text-sm font-medium">
          Select Location <span className="text-destructive">*</span>
        </label>
        <p className="text-xs text-muted-foreground mb-3">
          Click on the map or paste a Google Maps link to select a location
        </p>
        <LocationPicker
          onLocationSelect={handleLocationSelect}
          initialLocation={
            initialData
              ? initialData.coordinates
              : selectedLocation?.coordinates
          }
        />
      </div>

      {/* Selected Location Summary */}
      {selectedLocation && (
        <div className="p-4 bg-muted rounded-lg border border-border space-y-2">
          <div className="flex items-start gap-2">
            <MapPin className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium mb-1">Selected Location</p>
              <p className="text-xs text-muted-foreground font-mono mb-2">
                {selectedLocation.coordinates.latitude.toFixed(6)},{' '}
                {selectedLocation.coordinates.longitude.toFixed(6)}
              </p>
              {selectedLocation.address && (
                <p className="text-sm text-muted-foreground">
                  {selectedLocation.address.formattedAddress}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Form Actions */}
      <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
        <button
          type="button"
          onClick={handleCancel}
          disabled={isSaving}
          className="px-4 py-2 border border-input rounded-md text-sm font-medium hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSaving || !name.trim() || !selectedLocation}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {isSaving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              {mode === 'create' ? 'Create Location' : 'Save Changes'}
            </>
          )}
        </button>
      </div>
    </form>
  );
}

/**
 * LocationFormModal Component
 *
 * Wrapper that displays LocationForm in a modal overlay
 */
export function LocationFormModal({
  isOpen,
  mode,
  initialData,
  onSave,
  onClose,
}: {
  isOpen: boolean;
  mode: 'create' | 'edit';
  initialData?: Location;
  onSave: (data: LocationFormData) => Promise<void>;
  onClose: () => void;
}) {
  // Close modal on Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal Content */}
      <div className="relative bg-card border border-border rounded-lg shadow-lg w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <LocationForm
            mode={mode}
            initialData={initialData}
            onSave={onSave}
            onCancel={onClose}
          />
        </div>
      </div>
    </div>
  );
}
