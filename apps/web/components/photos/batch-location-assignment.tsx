/**
 * BatchLocationAssignment Component
 *
 * Modal for assigning a location to multiple photos at once with:
 * - Location library selection
 * - Create new location option
 * - Progress tracking
 * - Success/failure reporting
 * - Undo capability for failed operations
 *
 * This provides a streamlined workflow for assigning locations to
 * batches of photos taken at the same place.
 */

'use client';

import { useState } from 'react';
import { MapPin, Loader2, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { LocationSelector } from '@/components/maps/location-selector';
import {
  LocationFormModal,
  type LocationFormData,
} from '@/components/locations/location-form';

interface BatchLocationAssignmentProps {
  isOpen: boolean;
  photoIds: string[];
  onClose: () => void;
  onComplete?: (result: { success: number; failed: number }) => void;
}

type AssignmentState = 'selecting' | 'assigning' | 'complete' | 'error';

interface AssignmentResult {
  success: number;
  failed: number;
  locationName?: string;
}

/**
 * BatchLocationAssignment Component
 *
 * Handles the complete flow of batch-assigning a location to multiple photos.
 */
export function BatchLocationAssignment({
  isOpen,
  photoIds,
  onClose,
  onComplete,
}: BatchLocationAssignmentProps) {
  const [state, setState] = useState<AssignmentState>('selecting');
  const [result, setResult] = useState<AssignmentResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);

  /**
   * Handle location selection from library
   */
  const handleSelectLocation = async (locationId: string) => {
    setState('assigning');
    setError(null);

    try {
      const response = await fetch('/api/photos/batch-location', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          photoIds,
          locationId,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setResult({
          success: data.success,
          failed: data.failed,
          locationName: data.location?.name,
        });
        setState('complete');
        onComplete?.(data);
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to assign location');
        setState('error');
      }
    } catch (err) {
      console.error('Batch assignment error:', err);
      setError('Failed to assign location. Please try again.');
      setState('error');
    }
  };

  /**
   * Create new location and assign to photos
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

    // Close the creation modal
    setIsCreatingNew(false);

    // Then assign it to all photos
    await handleSelectLocation(newLocationId);
  };

  /**
   * Reset and close modal
   */
  const handleClose = () => {
    setState('selecting');
    setResult(null);
    setError(null);
    onClose();
  };

  /**
   * Handle retry after error
   */
  const handleRetry = () => {
    setState('selecting');
    setError(null);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={state === 'selecting' || state === 'complete' || state === 'error' ? handleClose : undefined}
      />

      {/* Modal Content */}
      <div className="relative bg-card border border-border rounded-lg shadow-lg w-full max-w-2xl max-h-[80vh] overflow-y-auto">
        <div className="p-6">
          {/* Header */}
          <div className="mb-6">
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <MapPin className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-xl font-bold">Assign Location to Photos</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    {photoIds.length} photo{photoIds.length !== 1 ? 's' : ''} selected
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Content based on state */}
          {state === 'selecting' && (
            <div>
              <p className="text-sm text-muted-foreground mb-4">
                Choose a location from your library or create a new one. The location will be
                assigned to all selected photos.
              </p>

              <LocationSelector
                onSelect={handleSelectLocation}
                onCreateNew={() => setIsCreatingNew(true)}
                maxHeight="400px"
              />

              <div className="mt-6 flex justify-end">
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-4 py-2 border border-input rounded-md text-sm font-medium hover:bg-accent transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {state === 'assigning' && (
            <div className="py-12 text-center">
              <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
              <p className="text-lg font-medium mb-2">Assigning location...</p>
              <p className="text-sm text-muted-foreground">
                Processing {photoIds.length} photo{photoIds.length !== 1 ? 's' : ''}
              </p>
            </div>
          )}

          {state === 'complete' && result && (
            <div className="py-8">
              <div className="text-center mb-6">
                <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="w-8 h-8 text-green-500" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Location Assigned!</h3>
                {result.locationName && (
                  <p className="text-sm text-muted-foreground mb-4">
                    Location &quot;{result.locationName}&quot; has been assigned
                  </p>
                )}
              </div>

              {/* Results Summary */}
              <div className="space-y-3 mb-6">
                <div className="flex items-center justify-between p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-green-500" />
                    <span className="text-sm font-medium">Successfully assigned</span>
                  </div>
                  <span className="text-lg font-bold text-green-500">{result.success}</span>
                </div>

                {result.failed > 0 && (
                  <div className="flex items-center justify-between p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                    <div className="flex items-center gap-2">
                      <XCircle className="w-5 h-5 text-destructive" />
                      <span className="text-sm font-medium">Failed to assign</span>
                    </div>
                    <span className="text-lg font-bold text-destructive">{result.failed}</span>
                  </div>
                )}
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-6 py-2 bg-primary text-primary-foreground rounded-md font-medium hover:bg-primary/90 transition-colors"
                >
                  Done
                </button>
              </div>
            </div>
          )}

          {state === 'error' && (
            <div className="py-8">
              <div className="text-center mb-6">
                <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
                  <AlertCircle className="w-8 h-8 text-destructive" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Assignment Failed</h3>
                <p className="text-sm text-destructive">
                  {error || 'An error occurred while assigning the location'}
                </p>
              </div>

              <div className="flex justify-center gap-3">
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-4 py-2 border border-input rounded-md text-sm font-medium hover:bg-accent transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleRetry}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
                >
                  Try Again
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

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
