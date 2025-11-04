/**
 * Location Storage Layer - Supabase Version
 *
 * Manages CRUD operations for user locations in the location library.
 * Each location represents a place that users can associate with their photos.
 */

import { v4 as uuidv4 } from "uuid";
import type { Location, LocationIndex } from "@/types/storage";
import type { GeocodingResult } from "@/lib/maps/types";
import { NotFoundError, UnauthorizedError } from "./errors";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Location Storage Class - Supabase Version
 *
 * Provides CRUD operations for location library entries.
 */
export class LocationStorage {
  /**
   * Create a new location
   *
   * @param userId - Owner of the location
   * @param name - User-defined name (e.g., "Home", "Eiffel Tower")
   * @param coordinates - Latitude and longitude
   * @param address - Optional address information from geocoding
   * @param options - Optional metadata (placeId, category, notes, isPublic)
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
      isPublic?: boolean;
    }
  ): Promise<Location> {
    const now = new Date().toISOString();
    const locationId = uuidv4();

    const { data, error } = await supabaseAdmin
      .from('locations')
      .insert({
        id: locationId,
        user_id: userId,
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
          : null,
        place_id: options?.placeId || null,
        category: options?.category || null,
        notes: options?.notes || null,
        is_public: options?.isPublic || false,
        usage_count: 0,
        created_at: now,
        updated_at: now,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create location: ${error.message}`);
    }

    return {
      id: data.id,
      userId: data.user_id,
      name: data.name,
      coordinates: data.coordinates,
      address: data.address,
      placeId: data.place_id,
      category: data.category,
      notes: data.notes,
      usageCount: data.usage_count,
      lastUsedAt: data.last_used_at,
      isPublic: data.is_public,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }

  /**
   * Find a location by ID
   *
   * @param locationId - Location ID
   * @param userId - User ID (for authorization)
   * @returns Location or null if not found
   */
  async findById(locationId: string, userId: string): Promise<Location | null> {
    const { data, error } = await supabaseAdmin
      .from('locations')
      .select('*')
      .eq('id', locationId)
      .eq('user_id', userId)
      .single();

    if (error || !data) {
      return null;
    }

    return {
      id: data.id,
      userId: data.user_id,
      name: data.name,
      coordinates: data.coordinates,
      address: data.address,
      placeId: data.place_id,
      category: data.category,
      notes: data.notes,
      usageCount: data.usage_count,
      lastUsedAt: data.last_used_at,
      isPublic: data.is_public,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }

  /**
   * Get all locations for a user (returns index list)
   *
   * @param userId - User ID
   * @returns Array of location indexes, sorted by usage count (descending)
   */
  async findByUserId(userId: string): Promise<LocationIndex[]> {
    const { data, error } = await supabaseAdmin
      .from('locations')
      .select('id, user_id, name, coordinates, address, usage_count, last_used_at, is_public, updated_at')
      .eq('user_id', userId)
      .order('usage_count', { ascending: false });

    if (error || !data) {
      return [];
    }

    return data.map(location => ({
      id: location.id,
      userId: location.user_id,
      name: location.name,
      coordinates: location.coordinates,
      formattedAddress: location.address?.formattedAddress,
      usageCount: location.usage_count,
      lastUsedAt: location.last_used_at,
      isPublic: location.is_public,
      updatedAt: location.updated_at,
    }));
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
      Pick<Location, "name" | "coordinates" | "address" | "category" | "notes" | "isPublic">
    >
  ): Promise<Location> {
    // Verify ownership first
    const existing = await this.findById(locationId, userId);
    if (!existing) {
      throw new NotFoundError("Location");
    }

    const { data, error } = await supabaseAdmin
      .from('locations')
      .update({
        name: updates.name,
        coordinates: updates.coordinates,
        address: updates.address,
        category: updates.category,
        notes: updates.notes,
        is_public: updates.isPublic,
        updated_at: new Date().toISOString(),
      })
      .eq('id', locationId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update location: ${error.message}`);
    }

    return {
      id: data.id,
      userId: data.user_id,
      name: data.name,
      coordinates: data.coordinates,
      address: data.address,
      placeId: data.place_id,
      category: data.category,
      notes: data.notes,
      usageCount: data.usage_count,
      lastUsedAt: data.last_used_at,
      isPublic: data.is_public,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
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
    // Verify ownership first
    const existing = await this.findById(locationId, userId);
    if (!existing) {
      throw new NotFoundError("Location");
    }

    const { error } = await supabaseAdmin
      .from('locations')
      .delete()
      .eq('id', locationId)
      .eq('user_id', userId);

    if (error) {
      throw new Error(`Failed to delete location: ${error.message}`);
    }
  }

  /**
   * Search locations by name
   *
   * @param userId - User ID
   * @param query - Search query (case-insensitive)
   * @returns Matching locations
   */
  async search(userId: string, query: string): Promise<LocationIndex[]> {
    const { data, error } = await supabaseAdmin
      .from('locations')
      .select('id, user_id, name, coordinates, address, usage_count, last_used_at, is_public, updated_at')
      .eq('user_id', userId)
      .ilike('name', `%${query}%`)
      .order('usage_count', { ascending: false });

    if (error || !data) {
      return [];
    }

    return data.map(location => ({
      id: location.id,
      userId: location.user_id,
      name: location.name,
      coordinates: location.coordinates,
      formattedAddress: location.address?.formattedAddress,
      usageCount: location.usage_count,
      lastUsedAt: location.last_used_at,
      isPublic: location.is_public,
      updatedAt: location.updated_at,
    }));
  }

  /**
   * Increment usage count for a location
   * This is called when a photo is associated with this location.
   *
   * @param locationId - Location ID
   * @param userId - User ID (for authorization)
   */
  async incrementUsage(locationId: string, userId: string): Promise<void> {
    // Verify ownership first
    const location = await this.findById(locationId, userId);
    if (!location) {
      throw new NotFoundError("Location");
    }

    await supabaseAdmin
      .from('locations')
      .update({
        usage_count: location.usageCount + 1,
        last_used_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', locationId)
      .eq('user_id', userId);
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

    await supabaseAdmin
      .from('locations')
      .update({
        usage_count: Math.max(0, location.usageCount - 1),
        updated_at: new Date().toISOString(),
      })
      .eq('id', locationId)
      .eq('user_id', userId);
  }

  /**
   * Get all public locations (shared by all users)
   *
   * @returns Array of public location indexes, sorted by usage count (descending)
   */
  async findPublicLocations(): Promise<LocationIndex[]> {
    const { data, error } = await supabaseAdmin
      .from('locations')
      .select('id, user_id, name, coordinates, address, usage_count, last_used_at, is_public, updated_at')
      .eq('is_public', true)
      .order('usage_count', { ascending: false });

    if (error || !data) {
      return [];
    }

    return data.map(location => ({
      id: location.id,
      userId: location.user_id,
      name: location.name,
      coordinates: location.coordinates,
      formattedAddress: location.address?.formattedAddress,
      usageCount: location.usage_count,
      lastUsedAt: location.last_used_at,
      isPublic: location.is_public,
      updatedAt: location.updated_at,
    }));
  }

  /**
   * Get all available locations for a user (their own + public locations)
   *
   * @param userId - User ID
   * @returns Array of location indexes (user's own + public), sorted by usage count
   */
  async findAvailableLocations(userId: string): Promise<LocationIndex[]> {
    const { data, error } = await supabaseAdmin
      .from('locations')
      .select('id, user_id, name, coordinates, address, usage_count, last_used_at, is_public, updated_at')
      .or(`user_id.eq.${userId},is_public.eq.true`)
      .order('usage_count', { ascending: false });

    if (error || !data) {
      return [];
    }

    return data.map(location => ({
      id: location.id,
      userId: location.user_id,
      name: location.name,
      coordinates: location.coordinates,
      formattedAddress: location.address?.formattedAddress,
      usageCount: location.usage_count,
      lastUsedAt: location.last_used_at,
      isPublic: location.is_public,
      updatedAt: location.updated_at,
    }));
  }
}

// Export singleton
export const locationStorage = new LocationStorage();
