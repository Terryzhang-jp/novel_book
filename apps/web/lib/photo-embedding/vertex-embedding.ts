/**
 * Vertex AI Multimodal Embedding Client
 * 
 * Uses multimodalembedding@001 model for image embedding
 */

import type { EmbeddingVector, VertexEmbeddingResponse } from './types';
import { DEFAULT_EMBEDDING_DIMENSION } from './types';

// Vertex AI configuration
const VERTEX_AI_REGION = process.env.VERTEX_AI_REGION || 'us-central1';
const GOOGLE_CLOUD_PROJECT = process.env.GOOGLE_CLOUD_PROJECT;
const MODEL_ID = 'multimodalembedding@001';

/**
 * Get access token using Application Default Credentials
 */
async function getAccessToken(): Promise<string> {
    // In production, use Google Auth Library
    // For now, use gcloud CLI credentials via metadata server or local

    // Try metadata server first (for Cloud Run / GCE)
    try {
        const metadataResponse = await fetch(
            'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',
            { headers: { 'Metadata-Flavor': 'Google' } }
        );
        if (metadataResponse.ok) {
            const data = await metadataResponse.json();
            return data.access_token;
        }
    } catch {
        // Not running on GCP, try local credentials
    }

    // For local development, use GOOGLE_ACCESS_TOKEN env var
    // Run: gcloud auth print-access-token
    const token = process.env.GOOGLE_ACCESS_TOKEN;
    if (token) {
        return token;
    }

    throw new Error(
        'No Google Cloud credentials available. Set GOOGLE_ACCESS_TOKEN or run on GCP.'
    );
}

/**
 * Generate embedding for an image from URL
 */
export async function generateImageEmbedding(
    imageUrl: string,
    dimension: 128 | 256 | 512 | 1408 = DEFAULT_EMBEDDING_DIMENSION
): Promise<EmbeddingVector | null> {
    if (!GOOGLE_CLOUD_PROJECT) {
        console.error('GOOGLE_CLOUD_PROJECT not set');
        return null;
    }

    try {
        const accessToken = await getAccessToken();

        // Fetch image and convert to base64
        const imageResponse = await fetch(imageUrl);
        if (!imageResponse.ok) {
            console.error(`Failed to fetch image: ${imageUrl}`);
            return null;
        }

        const imageBuffer = await imageResponse.arrayBuffer();
        const base64Image = Buffer.from(imageBuffer).toString('base64');
        const mimeType = imageResponse.headers.get('content-type') || 'image/jpeg';

        // Build Vertex AI request
        const endpoint = `https://${VERTEX_AI_REGION}-aiplatform.googleapis.com/v1/projects/${GOOGLE_CLOUD_PROJECT}/locations/${VERTEX_AI_REGION}/publishers/google/models/${MODEL_ID}:predict`;

        const requestBody = {
            instances: [
                {
                    image: {
                        bytesBase64Encoded: base64Image,
                    },
                },
            ],
            parameters: {
                dimension,
            },
        };

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Vertex AI error:', errorText);
            return null;
        }

        const data: VertexEmbeddingResponse = await response.json();

        if (!data.predictions?.[0]?.imageEmbedding) {
            console.error('No embedding in response');
            return null;
        }

        return {
            values: data.predictions[0].imageEmbedding,
            dimension,
        };
    } catch (error) {
        console.error('Error generating embedding:', error);
        return null;
    }
}

/**
 * Generate embeddings for multiple images (batch)
 */
export async function generateBatchEmbeddings(
    imageUrls: string[],
    dimension: 128 | 256 | 512 | 1408 = DEFAULT_EMBEDDING_DIMENSION
): Promise<Map<string, EmbeddingVector>> {
    const results = new Map<string, EmbeddingVector>();

    // Process in parallel with concurrency limit
    const BATCH_SIZE = 5;

    for (let i = 0; i < imageUrls.length; i += BATCH_SIZE) {
        const batch = imageUrls.slice(i, i + BATCH_SIZE);

        const batchResults = await Promise.all(
            batch.map(async (url) => {
                const embedding = await generateImageEmbedding(url, dimension);
                return { url, embedding };
            })
        );

        for (const { url, embedding } of batchResults) {
            if (embedding) {
                results.set(url, embedding);
            }
        }
    }

    return results;
}

/**
 * Calculate cosine similarity between two vectors
 */
export function cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
        throw new Error('Vectors must have same dimension');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Find most similar embeddings
 */
export function findSimilar(
    targetVector: number[],
    embeddings: Array<{ id: string; vector: number[] }>,
    topK: number = 5
): Array<{ id: string; similarity: number }> {
    const similarities = embeddings.map(({ id, vector }) => ({
        id,
        similarity: cosineSimilarity(targetVector, vector),
    }));

    return similarities
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, topK);
}
