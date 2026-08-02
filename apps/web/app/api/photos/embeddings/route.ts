/**
 * Photo Embeddings API Route
 * 
 * GET  - Get all photo embeddings for visualization
 * POST - Generate embeddings for photos (with SSE progress)
 * 
 * Uses Supabase for persistent storage
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { StorageError } from '@/lib/storage/errors';
import { photoStorage } from '@/lib/storage/photo-storage';
import { supabaseAdmin } from '@/lib/supabase/admin';
import {
    generateImageEmbedding,
    reduceEmbeddings,
    clusterEmbeddings,
    DEFAULT_EMBEDDING_DIMENSION,
} from '@/lib/photo-embedding';
import type { PhotoEmbedding, EmbeddingVisualization } from '@/lib/photo-embedding';
import { isAuthRequiredError } from "@/lib/auth/helpers";

// Database row type
interface EmbeddingRow {
    id: string;
    photo_id: string;
    user_id: string;
    vector: number[];
    dimension: number;
    created_at: string;
}

// Helper to convert database row to PhotoEmbedding
function dbRowToPhotoEmbedding(row: EmbeddingRow): PhotoEmbedding {
    return {
        photoId: row.photo_id,
        vector: row.vector,
        dimension: row.dimension,
        createdAt: row.created_at,
    };
}

// Concurrency limit for parallel processing
const CONCURRENCY_LIMIT = 5;

// Process photos in parallel with concurrency limit
async function processInParallel<T, R>(
    items: T[],
    processor: (item: T) => Promise<R>,
    concurrency: number
): Promise<R[]> {
    const results: R[] = [];
    const executing: Promise<void>[] = [];

    for (const item of items) {
        const p = processor(item).then(r => {
            results.push(r);
        });
        executing.push(p);

        if (executing.length >= concurrency) {
            await Promise.race(executing);
            // Remove completed promises
            for (let i = executing.length - 1; i >= 0; i--) {
                // Check if promise is settled by racing with resolved promise
                const settled = await Promise.race([
                    executing[i].then(() => true).catch(() => true),
                    Promise.resolve(false)
                ]);
                if (settled) {
                    executing.splice(i, 1);
                }
            }
        }
    }

    await Promise.all(executing);
    return results;
}

/**
 * GET /api/photos/embeddings
 * Get all embeddings for visualization
 */
export async function GET(request: NextRequest) {
    try {
        const session = await requireAuth(request);

        // Get user's photos (no limit)
        const photos = await photoStorage.findByUserId(session.userId, { limit: 1000 });
        const photoMap = new Map(photos.map(p => [p.id, p]));

        // Get embeddings from database
        const { data: embeddingRows, error } = await supabaseAdmin
            .from('photo_embeddings')
            .select('*')
            .eq('user_id', session.userId);

        if (error) {
            console.error('Failed to fetch embeddings:', error);
            throw new Error('Failed to fetch embeddings');
        }

        // Convert to PhotoEmbedding objects
        const photosWithEmbeddings: PhotoEmbedding[] = (embeddingRows || [])
            .filter((row: EmbeddingRow) => photoMap.has(row.photo_id))
            .map((row: EmbeddingRow) => dbRowToPhotoEmbedding(row));

        if (photosWithEmbeddings.length === 0) {
            return NextResponse.json({
                embeddings: [],
                visualizations: [],
                totalPhotos: photos.length,
                message: 'No embeddings generated yet. Click "Generate Embeddings" to start.',
            });
        }

        // Reduce dimensions for visualization
        const reducedCoords = reduceEmbeddings(photosWithEmbeddings);

        // Cluster embeddings (adaptive K based on photo count)
        const clusters = clusterEmbeddings(photosWithEmbeddings);

        // Build visualization data
        const visualizations: EmbeddingVisualization[] = photosWithEmbeddings.map((emb, i) => {
            const photo = photoMap.get(emb.photoId);
            return {
                photoId: emb.photoId,
                thumbnailUrl: photo?.fileUrl || '',
                x: reducedCoords[i]?.x || 0,
                y: reducedCoords[i]?.y || 0,
                z: reducedCoords[i]?.z,
                cluster: clusters[i],
                metadata: {
                    dateTime: photo?.metadata?.dateTime,
                    location: photo?.locationId,
                },
            };
        });

        return NextResponse.json({
            count: visualizations.length,
            totalPhotos: photos.length,
            visualizations,
        });

    } catch (error) {
    // 未认证要返回 401 而不是 500 —— 否则客户端无法区分「请先登录」和
    // 「服务端炸了」，监控里也会把正常的未登录流量记成错误。
    // 见 lib/auth/helpers.ts 的 AuthRequiredError。
    if (isAuthRequiredError(error)) {
      return NextResponse.json(
        { error: "Authentication required", code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }

        if (error instanceof StorageError) {
            return NextResponse.json(
                { error: error.message },
                { status: error.statusCode }
            );
        }

        console.error('Get embeddings error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}

/**
 * POST /api/photos/embeddings
 * Generate embeddings with SSE progress updates
 */
export async function POST(request: NextRequest) {
    try {
        const session = await requireAuth(request);

        const body = await request.json();
        const {
            photoIds,
            dimension = DEFAULT_EMBEDDING_DIMENSION,
            all = false,
            stream = false
        } = body;

        // Get existing embeddings from database
        const { data: existingEmbeddings } = await supabaseAdmin
            .from('photo_embeddings')
            .select('photo_id')
            .eq('user_id', session.userId);

        const existingPhotoIds = new Set(
            (existingEmbeddings || []).map((e: { photo_id: string }) => e.photo_id)
        );

        // Get photos to process (no limit)
        let photosToProcess: Array<{ id: string; fileUrl: string }> = [];

        if (all) {
            const photos = await photoStorage.findByUserId(session.userId, { limit: 1000 });
            photosToProcess = photos
                .filter(p => !existingPhotoIds.has(p.id))
                .map(p => ({ id: p.id, fileUrl: p.fileUrl }));
        } else if (photoIds && Array.isArray(photoIds)) {
            for (const photoId of photoIds) {
                if (!existingPhotoIds.has(photoId)) {
                    const photo = await photoStorage.findById(photoId);
                    if (photo && photo.userId === session.userId) {
                        photosToProcess.push({ id: photo.id, fileUrl: photo.fileUrl });
                    }
                }
            }
        } else {
            return NextResponse.json(
                { error: 'Provide photoIds array or set all=true' },
                { status: 400 }
            );
        }

        if (photosToProcess.length === 0) {
            return NextResponse.json({
                message: 'No new photos to process (all already have embeddings)',
                generated: 0,
                existing: existingPhotoIds.size,
            });
        }

        // If streaming is requested, use SSE
        if (stream) {
            const encoder = new TextEncoder();
            const readable = new ReadableStream({
                async start(controller) {
                    const sendEvent = (data: object) => {
                        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
                    };

                    const total = photosToProcess.length;
                    let processed = 0;
                    let generated = 0;
                    let failed = 0;

                    // Send initial status
                    sendEvent({
                        type: 'start',
                        total,
                        message: `Starting to process ${total} photos...`
                    });

                    // Process in batches for parallel execution
                    const batchSize = CONCURRENCY_LIMIT;

                    for (let i = 0; i < photosToProcess.length; i += batchSize) {
                        const batch = photosToProcess.slice(i, i + batchSize);

                        const batchPromises = batch.map(async ({ id, fileUrl }) => {
                            try {
                                const embedding = await generateImageEmbedding(fileUrl, dimension);

                                if (embedding) {
                                    const { error: insertError } = await supabaseAdmin
                                        .from('photo_embeddings')
                                        .upsert({
                                            photo_id: id,
                                            user_id: session.userId,
                                            vector: embedding.values,
                                            dimension: embedding.dimension,
                                            created_at: new Date().toISOString(),
                                            updated_at: new Date().toISOString(),
                                        }, { onConflict: 'photo_id' });

                                    if (insertError) {
                                        return { success: false, id };
                                    }
                                    return { success: true, id };
                                }
                                return { success: false, id };
                            } catch {
                                return { success: false, id };
                            }
                        });

                        const results = await Promise.all(batchPromises);

                        for (const result of results) {
                            processed++;
                            if (result.success) {
                                generated++;
                            } else {
                                failed++;
                            }

                            // Send progress update
                            sendEvent({
                                type: 'progress',
                                processed,
                                total,
                                generated,
                                failed,
                                percent: Math.round((processed / total) * 100),
                            });
                        }
                    }

                    // Send completion
                    sendEvent({
                        type: 'complete',
                        generated,
                        failed,
                        total: processed,
                        message: `Generated ${generated} embeddings, ${failed} failed`,
                    });

                    controller.close();
                },
            });

            return new Response(readable, {
                headers: {
                    'Content-Type': 'text/event-stream',
                    'Cache-Control': 'no-cache',
                    'Connection': 'keep-alive',
                },
            });
        }

        // Non-streaming: process with parallel execution
        const results = {
            generated: 0,
            failed: 0,
            failedIds: [] as string[],
        };

        // Process in batches
        const batchSize = CONCURRENCY_LIMIT;
        for (let i = 0; i < photosToProcess.length; i += batchSize) {
            const batch = photosToProcess.slice(i, i + batchSize);

            const batchResults = await Promise.all(
                batch.map(async ({ id, fileUrl }) => {
                    try {
                        const embedding = await generateImageEmbedding(fileUrl, dimension);

                        if (embedding) {
                            const { error: insertError } = await supabaseAdmin
                                .from('photo_embeddings')
                                .upsert({
                                    photo_id: id,
                                    user_id: session.userId,
                                    vector: embedding.values,
                                    dimension: embedding.dimension,
                                    created_at: new Date().toISOString(),
                                    updated_at: new Date().toISOString(),
                                }, { onConflict: 'photo_id' });

                            if (insertError) {
                                return { success: false, id };
                            }
                            return { success: true, id };
                        }
                        return { success: false, id };
                    } catch {
                        return { success: false, id };
                    }
                })
            );

            for (const result of batchResults) {
                if (result.success) {
                    results.generated++;
                } else {
                    results.failed++;
                    results.failedIds.push(result.id);
                }
            }
        }

        // Get updated count
        const { count } = await supabaseAdmin
            .from('photo_embeddings')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', session.userId);

        return NextResponse.json({
            message: `Generated ${results.generated} embeddings`,
            ...results,
            totalEmbeddings: count || 0,
        });

    } catch (error) {
    // 未认证要返回 401 而不是 500 —— 否则客户端无法区分「请先登录」和
    // 「服务端炸了」，监控里也会把正常的未登录流量记成错误。
    // 见 lib/auth/helpers.ts 的 AuthRequiredError。
    if (isAuthRequiredError(error)) {
      return NextResponse.json(
        { error: "Authentication required", code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }

        if (error instanceof StorageError) {
            return NextResponse.json(
                { error: error.message },
                { status: error.statusCode }
            );
        }

        console.error('Generate embeddings error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
