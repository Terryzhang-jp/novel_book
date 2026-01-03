/**
 * Photo Embedding Types
 * 
 * Types for Vertex AI multimodal embedding and visualization
 */

/**
 * Raw embedding vector from Vertex AI
 */
export interface EmbeddingVector {
    /** 512-dimensional float array */
    values: number[];
    /** Dimension count (128, 256, 512, or 1408) */
    dimension: number;
}

/**
 * Reduced coordinates for visualization
 */
export interface ReducedCoordinates {
    x: number;
    y: number;
    z?: number; // Optional for 3D
}

/**
 * Photo embedding with metadata
 */
export interface PhotoEmbedding {
    /** Photo ID */
    photoId: string;
    /** Embedding vector */
    vector: number[];
    /** Dimension of the vector */
    dimension: number;
    /** Reduced 2D/3D coordinates for visualization */
    reducedCoords?: ReducedCoordinates;
    /** Timestamp when embedding was generated */
    createdAt: string;
}

/**
 * Embedding generation request
 */
export interface GenerateEmbeddingRequest {
    /** Photo IDs to generate embeddings for */
    photoIds: string[];
    /** Dimension to use (default: 512) */
    dimension?: 128 | 256 | 512 | 1408;
}

/**
 * Embedding generation response
 */
export interface GenerateEmbeddingResponse {
    /** Successfully generated embeddings */
    embeddings: PhotoEmbedding[];
    /** Failed photo IDs */
    failed: string[];
}

/**
 * Visualization data for scatter plot
 */
export interface EmbeddingVisualization {
    /** Photo ID */
    photoId: string;
    /** Photo thumbnail URL */
    thumbnailUrl: string;
    /** 2D/3D coordinates */
    x: number;
    y: number;
    z?: number;
    /** Optional cluster label */
    cluster?: number;
    /** Photo metadata for display */
    metadata?: {
        dateTime?: string;
        location?: string;
    };
}

/**
 * Vertex AI multimodal embedding API response
 */
export interface VertexEmbeddingResponse {
    predictions: Array<{
        imageEmbedding?: number[];
        textEmbedding?: number[];
    }>;
}

/**
 * UMAP configuration
 */
export interface UMAPConfig {
    /** Number of neighbors */
    nNeighbors?: number;
    /** Minimum distance */
    minDist?: number;
    /** Output dimensions (2 or 3) */
    nComponents?: 2 | 3;
    /** Random seed for reproducibility */
    seed?: number;
}

/**
 * Default UMAP configuration
 */
export const DEFAULT_UMAP_CONFIG: UMAPConfig = {
    nNeighbors: 15,
    minDist: 0.1,
    nComponents: 3,  // Default to 3D for starfield visualization
    seed: 42,
};

/**
 * Default embedding dimension
 */
export const DEFAULT_EMBEDDING_DIMENSION = 512 as const;
