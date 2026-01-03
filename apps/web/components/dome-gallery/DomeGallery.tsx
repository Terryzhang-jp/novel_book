"use client";

import React, { useRef, useCallback, useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import "./DomeGallery.css";

interface ImageItem {
  src: string;
  alt?: string;
}

interface DomeGalleryProps {
  images: (string | ImageItem)[];
  radius?: number;
  imageSize?: number;
}

/**
 * Golden angle spiral on a "belt" region of the sphere
 * Only distributes points between latitudes -50° to +50° (avoiding poles)
 * This creates a denser, more visually pleasing distribution
 */
function goldenSpiral(count: number): { theta: number; phi: number }[] {
  const points: { theta: number; phi: number }[] = [];
  const goldenAngle = Math.PI * (3 - Math.sqrt(5)); // ~137.5°

  // Latitude range: -50° to +50° in radians
  const minPhi = -50 * (Math.PI / 180);
  const maxPhi = 50 * (Math.PI / 180);

  for (let i = 0; i < count; i++) {
    // Distribute latitude evenly within the belt
    const t = i / (count - 1); // 0 to 1
    const phi = minPhi + t * (maxPhi - minPhi);

    // Golden angle for longitude
    const theta = i * goldenAngle;

    points.push({ theta, phi });
  }

  return points;
}

export default function DomeGallery({
  images,
  radius = 400,
  imageSize = 100,
}: DomeGalleryProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sphereRef = useRef<HTMLDivElement>(null);

  // Use refs for rotation to avoid re-renders during animation
  const rotationRef = useRef({ x: 0, y: 0 });
  const velocityRef = useRef({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);
  const lastPosRef = useRef({ x: 0, y: 0 });
  const lastTimeRef = useRef(0);

  // Modal state
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  // Normalize images
  const normalizedImages = useMemo(() => {
    return images.map((img, i) => {
      if (typeof img === "string") {
        return { src: img, alt: `Image ${i + 1}` };
      }
      return { src: img.src, alt: img.alt || `Image ${i + 1}` };
    });
  }, [images]);

  // Limit to 60 images
  const displayImages = useMemo(() => {
    return normalizedImages.slice(0, 60);
  }, [normalizedImages]);

  // Calculate positions using golden spiral on belt
  const positions = useMemo(() => {
    return goldenSpiral(displayImages.length);
  }, [displayImages.length]);

  // Update sphere transform
  const updateSphereTransform = useCallback(() => {
    if (sphereRef.current) {
      sphereRef.current.style.transform = `rotateX(${rotationRef.current.x}deg) rotateY(${rotationRef.current.y}deg)`;
    }
  }, []);

  // Animation loop
  useEffect(() => {
    let animationId: number;

    const animate = () => {
      if (!isDraggingRef.current) {
        if (Math.abs(velocityRef.current.x) > 0.01 || Math.abs(velocityRef.current.y) > 0.01) {
          rotationRef.current.y += velocityRef.current.x;
          // Limit X rotation to ±15° - Apple-style constraint
          rotationRef.current.x = Math.max(-15, Math.min(15, rotationRef.current.x + velocityRef.current.y));
          velocityRef.current.x *= 0.96;
          velocityRef.current.y *= 0.96;
        } else {
          // Gentle auto-rotate
          rotationRef.current.y += 0.06;
          // Slowly return X to 0 (always show the "good" angle)
          rotationRef.current.x *= 0.995;
        }
      }

      updateSphereTransform();
      animationId = requestAnimationFrame(animate);
    };

    animationId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationId);
  }, [updateSphereTransform]);

  // Pointer handlers
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    isDraggingRef.current = true;
    velocityRef.current = { x: 0, y: 0 };
    lastPosRef.current = { x: e.clientX, y: e.clientY };
    lastTimeRef.current = performance.now();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;

    const dx = e.clientX - lastPosRef.current.x;
    const dy = e.clientY - lastPosRef.current.y;
    const dt = performance.now() - lastTimeRef.current;

    rotationRef.current.y += dx * 0.3;
    // Tighter X constraint during drag - Apple feels "heavy" at extremes
    rotationRef.current.x = Math.max(-15, Math.min(15, rotationRef.current.x - dy * 0.15));

    if (dt > 0) {
      const newVelX = (dx / dt) * 8;
      const newVelY = (-dy / dt) * 4; // Less vertical momentum
      velocityRef.current.x = velocityRef.current.x * 0.5 + newVelX * 0.5;
      velocityRef.current.y = velocityRef.current.y * 0.5 + newVelY * 0.5;
    }

    lastPosRef.current = { x: e.clientX, y: e.clientY };
    lastTimeRef.current = performance.now();
  }, []);

  const handlePointerUp = useCallback(() => {
    isDraggingRef.current = false;
  }, []);

  // Calculate 3D position - photos face outward from sphere center
  const getImageStyle = useCallback((index: number): React.CSSProperties => {
    const pos = positions[index];
    if (!pos) return {};

    // Spherical to Cartesian
    const x = radius * Math.cos(pos.phi) * Math.sin(pos.theta);
    const y = radius * Math.sin(pos.phi);
    const z = radius * Math.cos(pos.phi) * Math.cos(pos.theta);

    // Face outward from center
    const rotY = (pos.theta * 180) / Math.PI;
    const rotX = (-pos.phi * 180) / Math.PI;

    return {
      transform: `
        translateX(${x}px)
        translateY(${-y}px)
        translateZ(${z}px)
        rotateY(${rotY}deg)
        rotateX(${rotX}deg)
      `,
      width: imageSize,
      height: imageSize,
    };
  }, [positions, radius, imageSize]);

  // Click detection
  const clickStartRef = useRef({ x: 0, y: 0, time: 0 });

  const handleImagePointerDown = useCallback((e: React.PointerEvent) => {
    clickStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      time: performance.now(),
    };
  }, []);

  const handleImageClick = useCallback((src: string, e: React.MouseEvent) => {
    const dx = Math.abs(e.clientX - clickStartRef.current.x);
    const dy = Math.abs(e.clientY - clickStartRef.current.y);
    const dt = performance.now() - clickStartRef.current.time;

    if (dx < 10 && dy < 10 && dt < 300) {
      setSelectedImage(src);
    }
  }, []);

  return (
    <div
      ref={containerRef}
      className="dome-container"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      {/* 3D Scene */}
      <div className="dome-scene">
        <div
          ref={sphereRef}
          className="dome-sphere"
          style={{
            transform: `rotateX(${rotationRef.current.x}deg) rotateY(${rotationRef.current.y}deg)`,
          }}
        >
          {displayImages.map((img, index) => (
            <div
              key={index}
              className="dome-image-wrapper"
              style={getImageStyle(index)}
              onPointerDown={handleImagePointerDown}
              onClick={(e) => handleImageClick(img.src, e)}
            >
              <img
                src={img.src}
                alt={img.alt}
                draggable={false}
                loading="lazy"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Vignette */}
      <div className="dome-vignette" />

      {/* Hint */}
      <div className="dome-hint">
        <span>← 拖动旋转 →</span>
      </div>

      {/* Modal */}
      {selectedImage && (
        <div className="dome-modal" onClick={() => setSelectedImage(null)}>
          <button
            className="dome-modal-close"
            onClick={() => setSelectedImage(null)}
          >
            <X size={24} />
          </button>
          <img
            src={selectedImage}
            alt="Enlarged"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

export { DomeGallery };
