/**
 * Location Storage Layer
 *
 * Manages CRUD operations for user locations in the location library.
 * Each location represents a place that users can associate with their photos.
 *
 * Storage structure:
 * - Full location: data/locations/{userId}/{locationId}.json
 * - Index: data/indexes/user-{userId}-locations.json (managed by IndexManager)
 *
 * This follows the same pattern as PhotoStorage and DocumentStorage.
 */

import { v4 as uuidv4 } from "uuid";
import { join } from "path";
import type { Location, LocationIndex } from "@/types/storage";
import type { GeocodingResult, LatLng } from "@/lib/maps/types";
import {
  atomicWriteJSON,
  readJSON,
  exists,
  deleteFile,
  ensureDir,
} from "./file-system";
import { PATHS } from "./init";
import { NotFoundError, UnauthorizedError } from "./errors";
import { indexManager } from "./index-manager";

/**
 * Location Storage Class
 *
 * Provides CRUD operations for location library entries.
 */
export class LocationStorage {
  /**
   * Get the path to a user's locations directory
   */
  private getUserLocationsDir(userId: string): string {
    return join(PATHS.LOCATIONS, userId);
  }

  /**
   * Get the path to a specific location file
   */
  private getLocationPath(userId: string, locationId: string): string {
    return join(this.getUserLocationsDir(userId), `${locationId}.json`);
  }

  /**
   * Create a new location
   *
   * @param userId - Owner of the location
   * @param name - User-defined name (e.g., "Home", "Eiffel Tower")
   * @param coordinates - Latitude and longitude
   * @param address - Optional address information from geocoding
   * @param options - Optional metadata (placeId, category, notes)
   * @returns Created location
   */
  async create(
    userId: string,
    name: string,
    coordinates: { latitude: number; longitude: number },
    address?: GeocodingResult,
    options?: {
      placeId?: string;
      category?: string;
      notes?: string;
    }
  ): Promise<Location> {
    // Ensure user's locations directory exists
    const userLocationsDir = this.getUserLocationsDir(userId);
    await ensureDir(userLocationsDir);

    // Create location object
    const now = new Date().toISOString();
    const location: Location = {
      id: uuidv4(),
      userId,
      name: name.trim(),
      coordinates,
      address: address
        ? {
            formattedAddress: address.formattedAddress,
            country: address.country,
            state: address.state,
            city: address.city,
            postalCode: address.postalCode,
          }
        : undefined,
      placeId: options?.placeId,
      category: options?.category,
      notes: options?.notes,
      usageCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    // Save to file
    const locationPath = this.getLocationPath(userId, location.id);
    await atomicWriteJSON(locationPath, location);

    // Add to index
    const locationIndex: LocationIndex = {
      id: location.id,
      name: location.name,
      coordinates: location.coordinates,
      formattedAddress: location.address?.formattedAddress,
      usageCount: location.usageCount,
      lastUsedAt: location.lastUsedAt,
      updatedAt: location.updatedAt,
    };
    await indexManager.addLocation(userId, locationIndex);

    return location;
  }

  /**
   * Find a location by ID
   *
   * @param locationId - Location ID
   * @returns Location or null if not found
   */
  async findById(locationId: string, userId: string): Promise<Location | null> {
    const path = this.getLocationPath(userId, locationId);
    if (!exists(path)) {
      return null;
    }

    const location = await readJSON<Location>(path);

    // Verify ownership
    if (location.userId !== userId) {
      return null;
    }

    return location;
  }

  /**
   * Get all locations for a user (returns index list)
   *
   * @param userId - User ID
   * @returns Array of location indexes, sorted by usage count (descending)
   */
  async findByUserId(userId: string): Promise<LocationIndex[]> {
    return await indexManager.getUserLocations(userId);
  }

  /**
   * Update a location
   *
   * @param locationId - Location ID
   * @param userId - User ID (for authorization)
   * @param updates - Fields to update
   * @returns Updated location
   */
  async update(
    locationId: string,
    userId: string,
    updates: Partial<
      Pick<Location, "name" | "coordinates" | "address" | "category" | "notes">
    >
  ): Promise<Location> {
    // Get existing location
    const location = await this.findById(locationId, userId);
    if (!location) {
      throw new NotFoundError("Location");
    }

    // Verify ownership
    if (location.userId !== userId) {
      throw new UnauthorizedError(
        "You don't have permission to update this location"
      );
    }

    // Apply updates
    const updatedLocation: Location = {
      ...location,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    // Save to file
    const locationPath = this.getLocationPath(userId, locationId);
    await atomicWriteJSON(locationPath, updatedLocation);

    // Update index
    const locationIndex: LocationIndex = {
      id: updatedLocation.id,
      name: updatedLocation.name,
      coordinates: updatedLocation.coordinates,
      formattedAddress: updatedLocation.address?.formattedAddress,
      usageCount: updatedLocation.usageCount,
      lastUsedAt: updatedLocation.lastUsedAt,
      updatedAt: updatedLocation.updatedAt,
    };
    await indexManager.updateLocation(userId, locationId, locationIndex);

    return updatedLocation;
  }

  /**
   * Delete a location
   *
   * Note: This does NOT remove the location from photos that reference it.
   * Photos will keep their location data but lose the library link.
   *
   * @param locationId - Location ID
   * @param userId - User ID (for authorization)
   */
  async delete(locationId: string, userId: string): Promise<void> {
    // Get existing location
    const location = await this.findById(locationId, userId);
    if (!location) {
      throw new NotFoundError("Location");
    }

    // Verify ownership
    if (location.userId !== userId) {
      throw new UnauthorizedError(
        "You don't have permission to delete this location"
      );
    }

    // Delete file
    const locationPath = this.getLocationPath(userId, locationId);
    if (exists(locationPath)) {
      await deleteFile(locationPath);
    }

    // Remove from index
    await indexManager.removeLocation(userId, locationId);
  }

  /**
   * Search locations by name
   *
   * @param userId - User ID
   * @param query - Search query (case-insensitive)
   * @returns Matching locations
   */
  async search(userId: string, query: string): Promise<LocationIndex[]> {
    return await indexManager.searchLocations(userId, query);
  }

  /**
   * Increment usage count for a location
   * This is called when a photo is associated with this location.
   *
   * @param locationId - Location ID
   * @param userId - User ID (for authorization)
   */
  async incrementUsage(locationId: string, userId: string): Promise<void> {
    // Get existing location
    const location = await this.findById(locationId, userId);
    if (!location) {
      throw new NotFoundError("Location");
    }

    // Verify ownership
    if (location.userId !== userId) {
      throw new UnauthorizedError(
        "You don't have permission to update this location"
      );
    }

    // Increment usage count and update last used time
    const updatedLocation: Location = {
      ...location,
      usageCount: location.usageCount + 1,
      lastUsedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Save to file
    const locationPath = this.getLocationPath(userId, locationId);
    await atomicWriteJSON(locationPath, updatedLocation);

    // Update index
    const locationIndex: LocationIndex = {
      id: updatedLocation.id,
      name: updatedLocation.name,
      coordinates: updatedLocation.coordinates,
      formattedAddress: updatedLocation.address?.formattedAddress,
      usageCount: updatedLocation.usageCount,
      lastUsedAt: updatedLocation.lastUsedAt,
      updatedAt: updatedLocation.updatedAt,
    };
    await indexManager.updateLocation(userId, locationId, locationIndex);
  }

  /**
   * Decrement usage count for a location
   * This is called when a photo's association with this location is removed.
   *
   * @param locationId - Location ID
   * @param userId - User ID (for authorization)
   */
  async decrementUsage(locationId: string, userId: string): Promise<void> {
    // Get existing location
    const location = await this.findById(locationId, userId);
    if (!location) {
      // Location might have been deleted, silently return
      return;
    }

    // Verify ownership
    if (location.userId !== userId) {
      return;
    }

    // Decrement usage count (minimum 0)
    const updatedLocation: Location = {
      ...location,
      usageCount: Math.max(0, location.usageCount - 1),
      updatedAt: new Date().toISOString(),
    };

    // Save to file
    const locationPath = this.getLocationPath(userId, locationId);
    await atomicWriteJSON(locationPath, updatedLocation);

    // Update index
    const locationIndex: LocationIndex = {
      id: updatedLocation.id,
      name: updatedLocation.name,
      coordinates: updatedLocation.coordinates,
      formattedAddress: updatedLocation.address?.formattedAddress,
      usageCount: updatedLocation.usageCount,
      lastUsedAt: updatedLocation.lastUsedAt,
      updatedAt: updatedLocation.updatedAt,
    };
    await indexManager.updateLocation(userId, locationId, locationIndex);
  }
}

// Export singleton
export const locationStorage = new LocationStorage();
