/**
 * DateTimeAssignment Component
 *
 * Manages date/time assignment for a single photo with:
 * - Display current date/time (from EXIF or manual)
 * - Edit date/time with datetime-local input
 * - Remove manually set date/time
 * - Visual indication of source (EXIF vs manual)
 *
 * This component is integrated into the photo details page.
 */

'use client';

import { useState } from 'react';
import { Calendar, Edit, X, Loader2, Check } from 'lucide-react';
import type { Photo } from '@/types/storage';

interface DateTimeAssignmentProps {
  photo: Photo;
  onDateTimeChange?: (updatedPhoto: Photo) => void;
  className?: string;
}

/**
 * DateTimeAssignment Component
 *
 * Provides a complete UI for managing a photo's date/time.
 */
export function DateTimeAssignment({
  photo,
  onDateTimeChange,
  className = '',
}: DateTimeAssignmentProps) {
  // UI state
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasDateTime = !!photo.metadata?.dateTime;
  const dateTime = photo.metadata?.dateTime;

  /**
   * Format datetime for display
   */
  const formatDateTime = (isoString: string): string => {
    const date = new Date(isoString);
    return date.toLocaleString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  /**
   * Format datetime for input (datetime-local requires specific format)
   */
  const formatForInput = (isoString: string): string => {
    const date = new Date(isoString);
    // Format: YYYY-MM-DDTHH:mm
    return date.toISOString().slice(0, 16);
  };

  /**
   * Start editing
   */
  const handleStartEdit = () => {
    if (hasDateTime) {
      setEditValue(formatForInput(dateTime!));
    } else {
      // Default to current date/time
      setEditValue(formatForInput(new Date().toISOString()));
    }
    setIsEditing(true);
    setError(null);
  };

  /**
   * Save date/time
   */
  const handleSave = async () => {
    if (!editValue) {
      setError('Please select a date and time');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      // Convert to ISO string
      const isoString = new Date(editValue).toISOString();

      const response = await fetch(`/api/photos/${photo.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dateTime: isoString }),
      });

      if (response.ok) {
        const data = await response.json();
        onDateTimeChange?.(data.photo);
        setIsEditing(false);
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to update date/time');
      }
    } catch (err) {
      console.error('Failed to update date/time:', err);
      setError('Failed to update date/time. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  /**
   * Remove date/time
   */
  const handleRemove = async () => {
    setIsRemoving(true);
    setError(null);

    try {
      const response = await fetch(`/api/photos/${photo.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dateTime: null }),
      });

      if (response.ok) {
        const data = await response.json();
        onDateTimeChange?.(data.photo);
        setIsEditing(false);
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to remove date/time');
      }
    } catch (err) {
      console.error('Failed to remove date/time:', err);
      setError('Failed to remove date/time. Please try again.');
    } finally {
      setIsRemoving(false);
    }
  };

  /**
   * Cancel editing
   */
  const handleCancel = () => {
    setIsEditing(false);
    setError(null);
  };

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-muted-foreground" />
          <h3 className="font-medium">Date & Time</h3>
        </div>
        {hasDateTime && (
          <span className="text-xs px-2 py-0.5 bg-blue-500/10 text-blue-500 rounded-full">
            EXIF
          </span>
        )}
      </div>

      {/* Current Date/Time Display or Edit Mode */}
      {!isEditing ? (
        <>
          {hasDateTime ? (
            <div className="p-3 bg-muted rounded-lg">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium mb-1">
                    {formatDateTime(dateTime!)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    From photo EXIF data
                  </p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    type="button"
                    onClick={handleStartEdit}
                    className="p-1.5 hover:bg-accent rounded-md transition-colors"
                    aria-label="Edit date/time"
                  >
                    <Edit className="w-4 h-4 text-muted-foreground" />
                  </button>
                  <button
                    type="button"
                    onClick={handleRemove}
                    disabled={isRemoving}
                    className="p-1.5 hover:bg-destructive/10 rounded-md transition-colors disabled:opacity-50"
                    aria-label="Remove date/time"
                  >
                    {isRemoving ? (
                      <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                    ) : (
                      <X className="w-4 h-4 text-destructive" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 border-2 border-dashed border-border rounded-lg text-center">
              <p className="text-sm text-muted-foreground mb-3">No date/time set</p>
              <button
                type="button"
                onClick={handleStartEdit}
                className="px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                <Calendar className="w-4 h-4 inline-block mr-1" />
                Set Date & Time
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="p-4 border border-border rounded-lg space-y-3">
          <div>
            <label htmlFor="datetime-input" className="block text-sm font-medium mb-2">
              Select Date & Time
            </label>
            <input
              id="datetime-input"
              type="datetime-local"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || !editValue}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>Save</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              disabled={isSaving}
              className="px-4 py-2 border border-border rounded-md text-sm font-medium hover:bg-accent transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}
    </div>
  );
}
