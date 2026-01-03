"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { ArrowLeft, Loader2, RefreshCw, Sparkles, ZoomIn, ZoomOut, X, Box, Grid2X2 } from "lucide-react";
import { toast } from "sonner";
import { AppLayout } from "@/components/layout/app-layout";
import type { EmbeddingVisualization } from "@/lib/photo-embedding";

// Dynamically import StarfieldCanvas to avoid SSR issues with Three.js
const StarfieldCanvas = dynamic(
    () => import("@/components/gallery/starfield-canvas").then(mod => mod.StarfieldCanvas),
    { ssr: false, loading: () => <div className="w-full h-full flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-purple-400" /></div> }
);

// Progress state type
interface ProgressState {
    processed: number;
    total: number;
    generated: number;
    failed: number;
    percent: number;
}

// Extended cluster colors (synced with starfield-canvas.tsx)
const CLUSTER_COLORS = [
    '#8B5CF6', // Purple
    '#06B6D4', // Cyan
    '#F59E0B', // Amber
    '#10B981', // Emerald
    '#EF4444', // Red
    '#EC4899', // Pink
    '#3B82F6', // Blue
    '#84CC16', // Lime
    '#F97316', // Orange
    '#14B8A6', // Teal
    '#A855F7', // Violet
    '#22D3EE', // Sky
    '#FACC15', // Yellow
    '#FB7185', // Rose
    '#818CF8', // Indigo
    '#34D399', // Emerald light
    '#FB923C', // Orange light
    '#C084FC', // Purple light
    '#2DD4BF', // Teal light
    '#FCD34D', // Amber light
];

// Get color for cluster (cycles through palette + generates new if needed)
function getClusterColor(clusterIndex: number): string {
    if (clusterIndex < CLUSTER_COLORS.length) {
        return CLUSTER_COLORS[clusterIndex];
    }
    const hue = (clusterIndex * 137.5) % 360;
    return `hsl(${hue}, 70%, 60%)`;
}

export default function GalleryExplorePage() {
    const router = useRouter();
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const [visualizations, setVisualizations] = useState<EmbeddingVisualization[]>([]);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [totalPhotos, setTotalPhotos] = useState(0);
    const [hoveredPhoto, setHoveredPhoto] = useState<EmbeddingVisualization | null>(null);
    const [selectedPhoto, setSelectedPhoto] = useState<EmbeddingVisualization | null>(null);

    // Zoom and pan
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });

    // Progress tracking
    const [progress, setProgress] = useState<ProgressState | null>(null);
    const abortControllerRef = useRef<AbortController | null>(null);

    // View mode: 3D or 2D
    const [viewMode, setViewMode] = useState<'3d' | '2d'>('3d');

    // Modal for selected photo
    const [showModal, setShowModal] = useState(false);

    // Fetch embeddings
    const fetchEmbeddings = useCallback(async () => {
        try {
            setLoading(true);
            const response = await fetch('/api/photos/embeddings');

            if (!response.ok) {
                if (response.status === 401) {
                    router.push('/login');
                    return;
                }
                throw new Error('Failed to fetch embeddings');
            }

            const data = await response.json();
            setVisualizations(data.visualizations || []);
            setTotalPhotos(data.totalPhotos || 0);
        } catch (error) {
            console.error('Error fetching embeddings:', error);
            toast.error('Failed to load embeddings');
        } finally {
            setLoading(false);
        }
    }, [router]);

    // Generate embeddings with streaming progress
    const generateEmbeddings = async () => {
        // Create abort controller for cancellation
        abortControllerRef.current = new AbortController();

        try {
            setGenerating(true);
            setProgress({ processed: 0, total: 0, generated: 0, failed: 0, percent: 0 });

            const response = await fetch('/api/photos/embeddings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ all: true, stream: true }),
                signal: abortControllerRef.current.signal,
            });

            if (!response.ok) {
                throw new Error('Failed to generate embeddings');
            }

            // Handle SSE stream
            const reader = response.body?.getReader();
            const decoder = new TextDecoder();

            if (!reader) {
                throw new Error('No response body');
            }

            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();

                if (done) break;

                buffer += decoder.decode(value, { stream: true });

                // Process complete SSE messages
                const lines = buffer.split('\n\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.slice(6));

                            if (data.type === 'start') {
                                setProgress(prev => ({ ...prev!, total: data.total }));
                            } else if (data.type === 'progress') {
                                setProgress({
                                    processed: data.processed,
                                    total: data.total,
                                    generated: data.generated,
                                    failed: data.failed,
                                    percent: data.percent,
                                });
                            } else if (data.type === 'complete') {
                                toast.success(data.message);
                            }
                        } catch {
                            // Ignore parse errors from incomplete messages
                        }
                    }
                }
            }

            // Refresh visualizations
            await fetchEmbeddings();
        } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
                toast.info('Embedding generation cancelled');
            } else {
                console.error('Error generating embeddings:', error);
                toast.error('Failed to generate embeddings');
            }
        } finally {
            setGenerating(false);
            setProgress(null);
            abortControllerRef.current = null;
        }
    };

    // Cancel embedding generation
    const cancelGeneration = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
    };

    // Initial fetch
    useEffect(() => {
        fetchEmbeddings();
    }, [fetchEmbeddings]);

    // Draw scatter plot
    useEffect(() => {
        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (!canvas || !container || visualizations.length === 0) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Set canvas size
        const rect = container.getBoundingClientRect();
        canvas.width = rect.width * window.devicePixelRatio;
        canvas.height = rect.height * window.devicePixelRatio;
        canvas.style.width = `${rect.width}px`;
        canvas.style.height = `${rect.height}px`;
        ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

        const width = rect.width;
        const height = rect.height;
        const centerX = width / 2;
        const centerY = height / 2;
        const scale = Math.min(width, height) * 0.4 * zoom;

        // Clear canvas
        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(0, 0, width, height);

        // Draw grid
        ctx.strokeStyle = '#1f1f1f';
        ctx.lineWidth = 1;
        for (let i = -10; i <= 10; i++) {
            const x = centerX + pan.x + i * scale * 0.2;
            const y = centerY + pan.y + i * scale * 0.2;

            if (x >= 0 && x <= width) {
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, height);
                ctx.stroke();
            }
            if (y >= 0 && y <= height) {
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(width, y);
                ctx.stroke();
            }
        }

        // Draw points
        const pointSize = Math.max(4, 8 * zoom);

        for (const vis of visualizations) {
            const x = centerX + pan.x + vis.x * scale;
            const y = centerY + pan.y + vis.y * scale;

            // Skip if out of bounds
            if (x < -pointSize || x > width + pointSize || y < -pointSize || y > height + pointSize) {
                continue;
            }

            const color = getClusterColor(vis.cluster ?? 0);
            const isHovered = hoveredPhoto?.photoId === vis.photoId;
            const isSelected = selectedPhoto?.photoId === vis.photoId;

            ctx.beginPath();
            ctx.arc(x, y, isHovered || isSelected ? pointSize * 1.5 : pointSize, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.fill();

            if (isHovered || isSelected) {
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 2;
                ctx.stroke();
            }
        }
    }, [visualizations, zoom, pan, hoveredPhoto, selectedPhoto]);

    // Handle mouse move for hover
    const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (!canvas || !container) return;

        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const width = rect.width;
        const height = rect.height;
        const centerX = width / 2;
        const centerY = height / 2;
        const scale = Math.min(width, height) * 0.4 * zoom;

        // Find closest point
        let closest: EmbeddingVisualization | null = null;
        let closestDist = Infinity;

        for (const vis of visualizations) {
            const px = centerX + pan.x + vis.x * scale;
            const py = centerY + pan.y + vis.y * scale;
            const dist = Math.sqrt((x - px) ** 2 + (y - py) ** 2);

            if (dist < 20 && dist < closestDist) {
                closestDist = dist;
                closest = vis;
            }
        }

        setHoveredPhoto(closest);
    }, [visualizations, zoom, pan]);

    // Handle click (2D mode)
    const handleClick = useCallback(() => {
        if (hoveredPhoto) {
            setSelectedPhoto(hoveredPhoto);
            setShowModal(true);  // Also show modal in 2D mode
        } else {
            setSelectedPhoto(null);
        }
    }, [hoveredPhoto]);

    // Handle zoom
    const handleZoomIn = () => setZoom(z => Math.min(z * 1.5, 5));
    const handleZoomOut = () => setZoom(z => Math.max(z / 1.5, 0.5));

    return (
        <AppLayout>
            <div className="min-h-screen bg-[#0a0a0a] text-white">
                {/* Header */}
                <div className="sticky top-0 z-20 border-b border-white/10 bg-[#0a0a0a]/90 backdrop-blur-xl">
                    <div className="max-w-7xl mx-auto px-6 py-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <Link
                                    href="/gallery"
                                    className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                                >
                                    <ArrowLeft className="w-5 h-5" />
                                </Link>
                                <div>
                                    <h1 className="text-xl font-semibold flex items-center gap-2">
                                        <Sparkles className="w-5 h-5 text-purple-400" />
                                        Photo Embedding Explorer
                                    </h1>
                                    <p className="text-sm text-white/50">
                                        {visualizations.length} / {totalPhotos} photos embedded
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                {/* 3D/2D Toggle */}
                                <div className="flex items-center bg-white/5 rounded-lg p-1">
                                    <button
                                        onClick={() => setViewMode('3d')}
                                        className={`p-2 rounded-md transition-colors ${viewMode === '3d' ? 'bg-purple-600 text-white' : 'text-white/50 hover:text-white'}`}
                                        title="3D Starfield View"
                                    >
                                        <Box className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => setViewMode('2d')}
                                        className={`p-2 rounded-md transition-colors ${viewMode === '2d' ? 'bg-purple-600 text-white' : 'text-white/50 hover:text-white'}`}
                                        title="2D Flat View"
                                    >
                                        <Grid2X2 className="w-4 h-4" />
                                    </button>
                                </div>

                                <div className="w-px h-6 bg-white/10 mx-2" />

                                {/* Zoom controls (2D only) */}
                                {viewMode === '2d' && (
                                    <>
                                        <button
                                            onClick={handleZoomOut}
                                            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                                            title="Zoom out"
                                        >
                                            <ZoomOut className="w-5 h-5" />
                                        </button>
                                        <span className="text-sm text-white/50 w-12 text-center">
                                            {Math.round(zoom * 100)}%
                                        </span>
                                        <button
                                            onClick={handleZoomIn}
                                            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                                            title="Zoom in"
                                        >
                                            <ZoomIn className="w-5 h-5" />
                                        </button>

                                        <div className="w-px h-6 bg-white/10 mx-2" />
                                    </>
                                )}

                                {/* Generate/Cancel button */}
                                {generating ? (
                                    <button
                                        onClick={cancelGeneration}
                                        className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 rounded-lg transition-colors text-sm font-medium"
                                    >
                                        <X className="w-4 h-4" />
                                        Cancel
                                    </button>
                                ) : (
                                    <button
                                        onClick={generateEmbeddings}
                                        className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg transition-colors text-sm font-medium"
                                    >
                                        <RefreshCw className="w-4 h-4" />
                                        Generate Embeddings
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Progress Bar */}
                    {generating && progress && (
                        <div className="border-t border-white/10 bg-[#111] px-6 py-3">
                            <div className="max-w-7xl mx-auto">
                                <div className="flex items-center gap-4">
                                    <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
                                    <div className="flex-1">
                                        <div className="flex items-center justify-between text-sm mb-1">
                                            <span className="text-white/70">
                                                Processing {progress.processed} / {progress.total} photos
                                            </span>
                                            <span className="text-white/50">
                                                {progress.percent}% •
                                                <span className="text-green-400 ml-1">{progress.generated} ✓</span>
                                                {progress.failed > 0 && (
                                                    <span className="text-red-400 ml-1">{progress.failed} ✗</span>
                                                )}
                                            </span>
                                        </div>
                                        <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-gradient-to-r from-purple-600 to-purple-400 transition-all duration-300 ease-out"
                                                style={{ width: `${progress.percent}%` }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Main content */}
                <div className="flex h-[calc(100vh-80px)]">
                    {/* Canvas */}
                    <div ref={containerRef} className="flex-1 relative">
                        {loading ? (
                            <div className="absolute inset-0 flex items-center justify-center">
                                <div className="text-center">
                                    <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-purple-400" />
                                    <p className="text-white/50">Loading embeddings...</p>
                                </div>
                            </div>
                        ) : visualizations.length === 0 ? (
                            <div className="absolute inset-0 flex items-center justify-center">
                                <div className="text-center max-w-md">
                                    <Sparkles className="w-12 h-12 mx-auto mb-4 text-purple-400" />
                                    <h2 className="text-xl font-semibold mb-2">No Embeddings Yet</h2>
                                    <p className="text-white/50 mb-6">
                                        Generate embeddings to visualize your photos in style space.
                                        Similar photos will appear close together.
                                    </p>
                                    <button
                                        onClick={generateEmbeddings}
                                        disabled={generating}
                                        className="flex items-center gap-2 px-6 py-3 bg-purple-600 hover:bg-purple-500 rounded-lg transition-colors font-medium mx-auto"
                                    >
                                        {generating ? (
                                            <Loader2 className="w-5 h-5 animate-spin" />
                                        ) : (
                                            <Sparkles className="w-5 h-5" />
                                        )}
                                        Generate Embeddings
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <>
                                {viewMode === '3d' ? (
                                    <StarfieldCanvas
                                        visualizations={visualizations}
                                        onPhotoHover={setHoveredPhoto}
                                        onPhotoSelect={(photo) => {
                                            setSelectedPhoto(photo);
                                            if (photo) setShowModal(true);
                                        }}
                                        selectedPhotoId={selectedPhoto?.photoId}
                                    />
                                ) : (
                                    <canvas
                                        ref={canvasRef}
                                        className="w-full h-full cursor-crosshair"
                                        onMouseMove={handleMouseMove}
                                        onClick={handleClick}
                                    />
                                )}
                            </>
                        )}

                        {/* Hover tooltip */}
                        {hoveredPhoto && (
                            <div className="absolute bottom-4 left-4 bg-black/80 backdrop-blur-sm rounded-xl p-3 border border-white/10 flex items-center gap-3">
                                <img
                                    src={hoveredPhoto.thumbnailUrl}
                                    alt=""
                                    className="w-16 h-16 object-cover rounded-lg"
                                />
                                <div>
                                    <p className="text-sm font-medium">Photo</p>
                                    <p className="text-xs text-white/50">
                                        Cluster {(hoveredPhoto.cluster || 0) + 1}
                                    </p>
                                    {hoveredPhoto.metadata?.dateTime && (
                                        <p className="text-xs text-white/40">
                                            {new Date(hoveredPhoto.metadata.dateTime).toLocaleDateString()}
                                        </p>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Selected photo panel */}
                    {selectedPhoto && (
                        <div className="w-80 border-l border-white/10 bg-[#111] p-4 overflow-y-auto">
                            <div className="aspect-square rounded-xl overflow-hidden mb-4">
                                <img
                                    src={selectedPhoto.thumbnailUrl}
                                    alt=""
                                    className="w-full h-full object-cover"
                                />
                            </div>

                            <div className="space-y-3">
                                <div>
                                    <p className="text-xs text-white/50 uppercase tracking-wide">Cluster</p>
                                    <div className="flex items-center gap-2 mt-1">
                                        <div
                                            className="w-3 h-3 rounded-full"
                                            style={{ backgroundColor: getClusterColor(selectedPhoto.cluster ?? 0) }}
                                        />
                                        <span className="font-medium">Group {(selectedPhoto.cluster || 0) + 1}</span>
                                    </div>
                                </div>

                                <div>
                                    <p className="text-xs text-white/50 uppercase tracking-wide">Position</p>
                                    <p className="font-mono text-sm mt-1">
                                        ({selectedPhoto.x.toFixed(3)}, {selectedPhoto.y.toFixed(3)})
                                    </p>
                                </div>

                                {selectedPhoto.metadata?.dateTime && (
                                    <div>
                                        <p className="text-xs text-white/50 uppercase tracking-wide">Date</p>
                                        <p className="text-sm mt-1">
                                            {new Date(selectedPhoto.metadata.dateTime).toLocaleString()}
                                        </p>
                                    </div>
                                )}

                                <Link
                                    href={`/gallery/photos/${selectedPhoto.photoId}`}
                                    className="block w-full text-center py-2 mt-4 bg-white/10 hover:bg-white/20 rounded-lg transition-colors text-sm"
                                >
                                    View Photo
                                </Link>
                            </div>
                        </div>
                    )}
                </div>

                {/* Photo Modal Popup */}
                {showModal && selectedPhoto && (
                    <div
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
                        onClick={() => setShowModal(false)}
                    >
                        <div
                            className="relative max-w-3xl max-h-[80vh] mx-4 bg-black/90 border border-white/20 rounded-2xl overflow-hidden shadow-2xl"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <button
                                onClick={() => setShowModal(false)}
                                className="absolute top-3 right-3 z-10 p-2 bg-black/50 hover:bg-black/70 rounded-full transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                            <img
                                src={selectedPhoto.thumbnailUrl}
                                alt=""
                                className="max-w-full max-h-[70vh] object-contain"
                            />
                            <div className="p-4 bg-gradient-to-t from-black/80 to-transparent">
                                <div className="flex items-center gap-3">
                                    <div
                                        className="w-4 h-4 rounded-full"
                                        style={{ backgroundColor: getClusterColor(selectedPhoto.cluster ?? 0) }}
                                    />
                                    <span className="text-sm">Cluster {(selectedPhoto.cluster || 0) + 1}</span>
                                    {selectedPhoto.metadata?.dateTime && (
                                        <span className="text-sm text-white/50">
                                            {new Date(selectedPhoto.metadata.dateTime).toLocaleDateString()}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Legend */}
                {visualizations.length > 0 && (
                    <div className="fixed bottom-4 right-4 bg-black/80 backdrop-blur-sm rounded-xl p-3 border border-white/10">
                        <p className="text-xs text-white/50 uppercase tracking-wide mb-2">Clusters</p>
                        <div className="flex flex-wrap gap-2 max-w-xs">
                            {Array.from(new Set(visualizations.map(v => v.cluster ?? 0))).sort((a, b) => a - b).map((clusterId) => (
                                <div key={clusterId} className="flex items-center gap-1">
                                    <div
                                        className="w-3 h-3 rounded-full"
                                        style={{ backgroundColor: CLUSTER_COLORS[clusterId] || `hsl(${(clusterId * 137.5) % 360}, 70%, 60%)` }}
                                    />
                                    <span className="text-xs">{clusterId + 1}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </AppLayout>
    );
}
