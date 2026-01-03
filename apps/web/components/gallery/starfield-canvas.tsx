"use client";

/**
 * Starfield Canvas - 3D Photo Embedding Visualization
 * 
 * Creates an immersive 3D starfield where each photo is a glowing particle.
 * Uses React Three Fiber for rendering.
 */

import { useRef, useMemo, useState, useCallback } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Stars } from "@react-three/drei";
import * as THREE from "three";
import type { EmbeddingVisualization } from "@/lib/photo-embedding";

// Extended cluster colors to support dynamic DBSCAN clusters
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
    // Generate additional colors using HSL
    const hue = (clusterIndex * 137.5) % 360; // Golden angle for good distribution
    return `hsl(${hue}, 70%, 60%)`;
}

interface StarfieldCanvasProps {
    visualizations: EmbeddingVisualization[];
    onPhotoHover?: (photo: EmbeddingVisualization | null) => void;
    onPhotoSelect?: (photo: EmbeddingVisualization | null) => void;
    selectedPhotoId?: string | null;
}

interface PhotoParticlesProps {
    visualizations: EmbeddingVisualization[];
    onHover: (photo: EmbeddingVisualization | null) => void;
    onSelect: (photo: EmbeddingVisualization | null) => void;
    selectedId?: string | null;
}

/**
 * Custom shader material for glowing particles
 */
function createGlowMaterial() {
    return new THREE.ShaderMaterial({
        uniforms: {
            time: { value: 0 },
        },
        vertexShader: `
            attribute float size;
            attribute vec3 customColor;
            varying vec3 vColor;
            varying float vAlpha;
            
            void main() {
                vColor = customColor;
                vAlpha = 1.0;
                
                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                gl_PointSize = size * (300.0 / -mvPosition.z);
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            varying vec3 vColor;
            varying float vAlpha;
            
            void main() {
                float dist = length(gl_PointCoord - vec2(0.5));
                if (dist > 0.5) discard;
                
                float alpha = 1.0 - smoothstep(0.0, 0.5, dist);
                float glow = exp(-dist * 3.0);
                
                vec3 finalColor = vColor + vec3(0.2) * glow;
                gl_FragColor = vec4(finalColor, alpha * vAlpha);
            }
        `,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    });
}

/**
 * Photo particles component - renders all photos as glowing spheres
 */
function PhotoParticles({ visualizations, onHover, onSelect, selectedId }: PhotoParticlesProps) {
    const groupRef = useRef<THREE.Group>(null);
    const { raycaster, pointer, camera } = useThree();
    const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

    // Create mesh data
    const meshData = useMemo(() => {
        return visualizations.map((vis, i) => ({
            position: [vis.x * 5, vis.y * 5, (vis.z ?? 0) * 5] as [number, number, number],
            color: getClusterColor(vis.cluster ?? 0),
            isSelected: vis.photoId === selectedId,
            vis,
            index: i,
        }));
    }, [visualizations, selectedId]);

    // Animation loop
    useFrame((state) => {
        if (groupRef.current) {
            groupRef.current.rotation.y = state.clock.elapsedTime * 0.02;
        }
    });

    return (
        <group ref={groupRef}>
            {meshData.map((data, i) => (
                <mesh
                    key={data.vis.photoId}
                    position={data.position}
                    onPointerOver={(e) => {
                        e.stopPropagation();
                        setHoveredIndex(i);
                        onHover(data.vis);
                    }}
                    onPointerOut={(e) => {
                        e.stopPropagation();
                        setHoveredIndex(null);
                        onHover(null);
                    }}
                    onClick={(e) => {
                        e.stopPropagation();
                        onSelect(data.vis);
                    }}
                >
                    <sphereGeometry args={[data.isSelected ? 0.25 : hoveredIndex === i ? 0.2 : 0.12, 16, 16]} />
                    <meshBasicMaterial
                        color={data.color}
                        transparent
                        opacity={hoveredIndex === i ? 1 : 0.9}
                    />
                </mesh>
            ))}
            {/* Glow effect for hovered/selected */}
            {meshData.map((data, i) => (
                (hoveredIndex === i || data.isSelected) && (
                    <mesh key={`glow-${data.vis.photoId}`} position={data.position}>
                        <sphereGeometry args={[data.isSelected ? 0.4 : 0.3, 16, 16]} />
                        <meshBasicMaterial
                            color={data.color}
                            transparent
                            opacity={0.3}
                        />
                    </mesh>
                )
            ))}
        </group>
    );
}

/**
 * Cluster lines - connects nearby photos in the same cluster
 */
function ClusterLines({ visualizations }: { visualizations: EmbeddingVisualization[] }) {
    const lines = useMemo(() => {
        const linePositions: number[] = [];
        const lineColors: number[] = [];

        // Group by cluster
        const clusters = new Map<number, EmbeddingVisualization[]>();
        visualizations.forEach(vis => {
            const cluster = vis.cluster ?? 0;
            if (!clusters.has(cluster)) {
                clusters.set(cluster, []);
            }
            clusters.get(cluster)!.push(vis);
        });

        // Connect nearby points within each cluster
        clusters.forEach((clusterPhotos, clusterIndex) => {
            const color = new THREE.Color(getClusterColor(clusterIndex));

            for (let i = 0; i < clusterPhotos.length - 1; i++) {
                const p1 = clusterPhotos[i];
                const p2 = clusterPhotos[i + 1];

                // Only connect if reasonably close
                const dx = p1.x - p2.x;
                const dy = p1.y - p2.y;
                const dz = (p1.z ?? 0) - (p2.z ?? 0);
                const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

                if (dist < 0.5) {
                    linePositions.push(
                        p1.x * 5, p1.y * 5, (p1.z ?? 0) * 5,
                        p2.x * 5, p2.y * 5, (p2.z ?? 0) * 5
                    );
                    lineColors.push(color.r, color.g, color.b, color.r, color.g, color.b);
                }
            }
        });

        return {
            positions: new Float32Array(linePositions),
            colors: new Float32Array(lineColors),
        };
    }, [visualizations]);

    if (lines.positions.length === 0) return null;

    return (
        <lineSegments>
            <bufferGeometry>
                <bufferAttribute
                    attach="attributes-position"
                    array={lines.positions}
                    count={lines.positions.length / 3}
                    itemSize={3}
                />
                <bufferAttribute
                    attach="attributes-color"
                    array={lines.colors}
                    count={lines.colors.length / 3}
                    itemSize={3}
                />
            </bufferGeometry>
            <lineBasicMaterial
                vertexColors
                transparent
                opacity={0.2}
                blending={THREE.AdditiveBlending}
            />
        </lineSegments>
    );
}

/**
 * Scene setup with lighting and controls
 */
function Scene({ children }: { children: React.ReactNode }) {
    return (
        <>
            {/* Ambient light for general illumination */}
            <ambientLight intensity={0.3} />

            {/* Background stars */}
            <Stars
                radius={100}
                depth={50}
                count={5000}
                factor={4}
                saturation={0}
                fade
                speed={0.5}
            />

            {/* Fog for depth effect */}
            <fog attach="fog" args={['#0a0a1a', 10, 50]} />

            {/* OrbitControls for interaction */}
            <OrbitControls
                enablePan={true}
                enableZoom={true}
                enableRotate={true}
                autoRotate={false}
                minDistance={3}
                maxDistance={30}
                dampingFactor={0.05}
                rotateSpeed={0.5}
            />

            {children}
        </>
    );
}

/**
 * Main Starfield Canvas component
 */
export function StarfieldCanvas({
    visualizations,
    onPhotoHover,
    onPhotoSelect,
    selectedPhotoId,
}: StarfieldCanvasProps) {
    const handleHover = useCallback((photo: EmbeddingVisualization | null) => {
        onPhotoHover?.(photo);
    }, [onPhotoHover]);

    const handleSelect = useCallback((photo: EmbeddingVisualization | null) => {
        onPhotoSelect?.(photo);
    }, [onPhotoSelect]);

    if (visualizations.length === 0) {
        return null;
    }

    return (
        <Canvas
            camera={{ position: [0, 0, 15], fov: 60 }}
            style={{ background: 'linear-gradient(180deg, #0a0a1a 0%, #1a0a2a 50%, #0a1a2a 100%)' }}
            dpr={[1, 2]}
        >
            <Scene>
                <PhotoParticles
                    visualizations={visualizations}
                    onHover={handleHover}
                    onSelect={handleSelect}
                    selectedId={selectedPhotoId}
                />
                <ClusterLines visualizations={visualizations} />
            </Scene>
        </Canvas>
    );
}

export default StarfieldCanvas;
