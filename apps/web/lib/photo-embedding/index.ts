/**
 * Photo Embedding Module
 * 
 * Exports all photo embedding functionality
 */

// Types
export type {
    EmbeddingVector,
    ReducedCoordinates,
    PhotoEmbedding,
    GenerateEmbeddingRequest,
    GenerateEmbeddingResponse,
    EmbeddingVisualization,
    VertexEmbeddingResponse,
    UMAPConfig,
} from './types';

export {
    DEFAULT_EMBEDDING_DIMENSION,
    DEFAULT_UMAP_CONFIG,
} from './types';

// Vertex AI embedding
export {
    generateImageEmbedding,
    generateBatchEmbeddings,
    cosineSimilarity,
    findSimilar,
} from './vertex-embedding';

// Dimensionality reduction
export {
    reduceEmbeddings,
    clusterEmbeddings,
} from './reduce-dimensions';
