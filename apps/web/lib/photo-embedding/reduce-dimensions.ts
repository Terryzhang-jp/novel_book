/**
 * Dimensionality Reduction - Proper PCA Implementation
 * 
 * Reduces high-dimensional embedding vectors to 2D/3D for visualization
 */

import type { ReducedCoordinates, UMAPConfig, PhotoEmbedding } from './types';
import { DEFAULT_UMAP_CONFIG } from './types';

/**
 * Compute the mean of each dimension
 */
function computeMean(vectors: number[][]): number[] {
    const n = vectors.length;
    const d = vectors[0].length;
    const mean = new Array(d).fill(0);

    for (const v of vectors) {
        for (let i = 0; i < d; i++) {
            mean[i] += v[i];
        }
    }

    for (let i = 0; i < d; i++) {
        mean[i] /= n;
    }

    return mean;
}

/**
 * Subtract mean from each vector (centering)
 */
function centerData(vectors: number[][], mean: number[]): number[][] {
    return vectors.map(v => v.map((x, i) => x - mean[i]));
}

/**
 * Compute covariance matrix (using a subset of dimensions for efficiency)
 */
function computeCovarianceMatrix(centered: number[][], maxDims: number = 100): number[][] {
    const n = centered.length;
    const d = Math.min(centered[0].length, maxDims);

    // Initialize covariance matrix
    const cov: number[][] = Array.from({ length: d }, () => new Array(d).fill(0));

    // Compute covariance (C = X^T * X / n)
    for (let i = 0; i < d; i++) {
        for (let j = i; j < d; j++) {
            let sum = 0;
            for (let k = 0; k < n; k++) {
                sum += centered[k][i] * centered[k][j];
            }
            cov[i][j] = sum / n;
            cov[j][i] = cov[i][j]; // Symmetric
        }
    }

    return cov;
}

/**
 * Power iteration method to find dominant eigenvector
 */
function powerIteration(matrix: number[][], iterations: number = 100): number[] {
    const n = matrix.length;

    // Initialize with random vector
    let v = Array.from({ length: n }, () => Math.random() - 0.5);

    // Normalize
    let norm = Math.sqrt(v.reduce((sum, x) => sum + x * x, 0));
    v = v.map(x => x / norm);

    for (let iter = 0; iter < iterations; iter++) {
        // Multiply by matrix
        const newV = new Array(n).fill(0);
        for (let i = 0; i < n; i++) {
            for (let j = 0; j < n; j++) {
                newV[i] += matrix[i][j] * v[j];
            }
        }

        // Normalize
        norm = Math.sqrt(newV.reduce((sum, x) => sum + x * x, 0));
        v = newV.map(x => x / (norm || 1));
    }

    return v;
}

/**
 * Deflate matrix to find next eigenvector
 */
function deflateMatrix(matrix: number[][], eigenvector: number[]): number[][] {
    const n = matrix.length;

    // Compute eigenvalue
    let eigenvalue = 0;
    for (let i = 0; i < n; i++) {
        let sum = 0;
        for (let j = 0; j < n; j++) {
            sum += matrix[i][j] * eigenvector[j];
        }
        eigenvalue += sum * eigenvector[i];
    }

    // Subtract outer product
    const deflated = matrix.map(row => [...row]);
    for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
            deflated[i][j] -= eigenvalue * eigenvector[i] * eigenvector[j];
        }
    }

    return deflated;
}

/**
 * Compute PCA - find top principal components
 */
function computePCA(
    vectors: number[][],
    nComponents: number = 3
): number[][] {
    const n = vectors.length;
    if (n === 0) return [];
    if (n === 1) return [[0, 0, 0].slice(0, nComponents)];

    const d = vectors[0].length;
    const maxDims = Math.min(d, 100); // Use first 100 dims for efficiency

    // Center the data
    const mean = computeMean(vectors);
    const centered = centerData(vectors, mean);

    // Truncate to maxDims for covariance computation
    const truncated = centered.map(v => v.slice(0, maxDims));

    // Compute covariance matrix
    let cov = computeCovarianceMatrix(truncated, maxDims);

    // Find top eigenvectors using power iteration
    const eigenvectors: number[][] = [];
    for (let i = 0; i < nComponents; i++) {
        const eigenvector = powerIteration(cov);
        eigenvectors.push(eigenvector);
        cov = deflateMatrix(cov, eigenvector);
    }

    // Project data onto eigenvectors
    const result: number[][] = [];
    for (let i = 0; i < n; i++) {
        const projected: number[] = [];
        for (let c = 0; c < nComponents; c++) {
            let sum = 0;
            for (let j = 0; j < maxDims; j++) {
                sum += truncated[i][j] * eigenvectors[c][j];
            }
            projected.push(sum);
        }
        result.push(projected);
    }

    // Normalize to [-1, 1] range with some spread
    const mins = new Array(nComponents).fill(Infinity);
    const maxs = new Array(nComponents).fill(-Infinity);

    for (const r of result) {
        for (let c = 0; c < nComponents; c++) {
            mins[c] = Math.min(mins[c], r[c]);
            maxs[c] = Math.max(maxs[c], r[c]);
        }
    }

    return result.map(r =>
        r.map((x, c) => {
            const range = maxs[c] - mins[c];
            return range > 0 ? 2 * (x - mins[c]) / range - 1 : 0;
        })
    );
}

/**
 * Add some noise to prevent overlapping points
 */
function addJitter(coords: number[][], amount: number = 0.02): number[][] {
    return coords.map(c => c.map(x => x + (Math.random() - 0.5) * amount));
}

/**
 * Reduce embedding dimensions for visualization
 * Uses proper PCA implementation
 */
export function reduceEmbeddings(
    embeddings: PhotoEmbedding[],
    config: UMAPConfig = DEFAULT_UMAP_CONFIG
): ReducedCoordinates[] {
    if (embeddings.length === 0) return [];

    const vectors = embeddings.map(e => e.vector);
    const nComponents = config.nComponents || 3;

    // Use proper PCA
    let reduced = computePCA(vectors, nComponents);

    // Add slight jitter to prevent exact overlaps
    reduced = addJitter(reduced);

    return reduced.map(coords => ({
        x: coords[0] || 0,
        y: coords[1] || 0,
        z: nComponents >= 3 ? coords[2] : undefined,
    }));
}

/**
 * Compute Euclidean distance between two vectors (using subset for efficiency)
 */
function euclideanDistance(v1: number[], v2: number[], maxDims: number = 100): number {
    let sum = 0;
    const d = Math.min(v1.length, maxDims);
    for (let i = 0; i < d; i++) {
        const diff = v1[i] - v2[i];
        sum += diff * diff;
    }
    return Math.sqrt(sum);
}

/**
 * Find neighbors within epsilon distance
 */
function rangeQuery(vectors: number[][], pointIdx: number, epsilon: number): number[] {
    const neighbors: number[] = [];
    const point = vectors[pointIdx];

    for (let i = 0; i < vectors.length; i++) {
        if (euclideanDistance(point, vectors[i]) <= epsilon) {
            neighbors.push(i);
        }
    }

    return neighbors;
}

/**
 * Estimate good epsilon value using k-distance graph
 * Uses a conservative percentile for tighter clusters
 */
function estimateEpsilon(vectors: number[][], k: number = 4): number {
    const n = vectors.length;
    const kDistances: number[] = [];

    for (let i = 0; i < n; i++) {
        const distances: number[] = [];
        for (let j = 0; j < n; j++) {
            if (i !== j) {
                distances.push(euclideanDistance(vectors[i], vectors[j]));
            }
        }
        distances.sort((a, b) => a - b);
        kDistances.push(distances[k - 1] || distances[distances.length - 1]);
    }

    kDistances.sort((a, b) => a - b);

    // Use a lower percentile (30%) for tighter, more numerous clusters
    const elbowIndex = Math.floor(n * 0.3);
    const epsilon = kDistances[elbowIndex] || kDistances[Math.floor(n / 4)];

    // Also compute median for reference
    const medianEpsilon = kDistances[Math.floor(n / 2)];

    // Use the smaller of: estimated epsilon or 70% of median
    return Math.min(epsilon, medianEpsilon * 0.7);
}

/**
 * Adaptive K-Means clustering
 * K is calculated based on data size: clamp(sqrt(N/2), 5, 15)
 */
export function clusterEmbeddings(
    embeddings: PhotoEmbedding[],
    overrideK?: number
): number[] {
    if (embeddings.length === 0) return [];
    if (embeddings.length === 1) return [0];

    const vectors = embeddings.map(e => e.vector);
    const n = vectors.length;
    const d = vectors[0].length;

    // Calculate adaptive K: sqrt(N/2), clamped to [5, 15]
    const adaptiveK = Math.round(Math.sqrt(n / 2));
    const nClusters = overrideK ?? Math.max(5, Math.min(15, adaptiveK));

    if (n <= nClusters) {
        return embeddings.map((_, i) => i % nClusters);
    }

    // K-Means++ initialization for better cluster centers
    const centroids: number[][] = [];

    // First centroid: random
    centroids.push([...vectors[Math.floor(Math.random() * n)]]);

    // Remaining centroids: D^2 weighted sampling
    for (let i = 1; i < nClusters; i++) {
        const distances: number[] = [];
        let totalDist = 0;

        for (let j = 0; j < n; j++) {
            let minDist = Infinity;
            for (const centroid of centroids) {
                const dist = euclideanDistance(vectors[j], centroid);
                minDist = Math.min(minDist, dist);
            }
            distances.push(minDist * minDist); // D^2 weighting
            totalDist += minDist * minDist;
        }

        // Sample proportional to distance squared
        let r = Math.random() * totalDist;
        for (let j = 0; j < n; j++) {
            r -= distances[j];
            if (r <= 0) {
                centroids.push([...vectors[j]]);
                break;
            }
        }

        if (centroids.length <= i) {
            centroids.push([...vectors[Math.floor(Math.random() * n)]]);
        }
    }

    // Run K-Means iterations
    const assignments = new Array(n).fill(0);

    for (let iter = 0; iter < 20; iter++) {
        // Assign to nearest centroid
        for (let i = 0; i < n; i++) {
            let minDist = Infinity;
            let minCluster = 0;

            for (let c = 0; c < nClusters; c++) {
                const dist = euclideanDistance(vectors[i], centroids[c]);
                if (dist < minDist) {
                    minDist = dist;
                    minCluster = c;
                }
            }
            assignments[i] = minCluster;
        }

        // Update centroids
        const counts = new Array(nClusters).fill(0);
        for (const c of centroids) {
            c.fill(0);
        }

        for (let i = 0; i < n; i++) {
            const c = assignments[i];
            counts[c]++;
            for (let j = 0; j < d; j++) {
                centroids[c][j] += vectors[i][j];
            }
        }

        for (let c = 0; c < nClusters; c++) {
            if (counts[c] > 0) {
                for (let j = 0; j < d; j++) {
                    centroids[c][j] /= counts[c];
                }
            }
        }
    }

    console.log(`K-Means: ${nClusters} clusters (adaptive from ${n} photos)`);

    return assignments;
}
