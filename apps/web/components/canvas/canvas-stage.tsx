/**
 * CanvasStage Component - Enhanced
 * 
 * Full-featured Konva Stage with all interactions
 */

'use client';

import { useRef, useState, useEffect } from 'react';
import { Stage, Layer, Image as KonvaImage, Text, Line, Rect, Circle, Transformer } from 'react-konva';
import { useCanvasStore } from '@/lib/canvas/canvas-store';
import type { CanvasElement } from './types';
import Konva from 'konva';

interface CanvasStageProps {
    selectedTool: string;
    selectedElement: string | null;
    onElementSelect: (id: string | null) => void;
}

export function CanvasStage({
    selectedTool,
    selectedElement,
    onElementSelect,
}: CanvasStageProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const stageRef = useRef<Konva.Stage>(null);
    const transformerRef = useRef<Konva.Transformer>(null);

    const [stageSize, setStageSize] = useState({ width: 1920, height: 1080 });

    const {
        elements,
        addElement,
        updateElement,
        setSelectedId,
        startDrawing,
        continueDrawing,
        endDrawing,
        isDrawing,
        currentDrawingPoints,
    } = useCanvasStore();

    // Update stage size on mount and resize
    useEffect(() => {
        const updateSize = () => {
            if (containerRef.current) {
                setStageSize({
                    width: containerRef.current.offsetWidth,
                    height: containerRef.current.offsetHeight,
                });
            }
        };

        updateSize();
        window.addEventListener('resize', updateSize);
        return () => window.removeEventListener('resize', updateSize);
    }, []);

    // Update transformer when selection changes
    useEffect(() => {
        if (transformerRef.current && stageRef.current) {
            const stage = stageRef.current;
            const transformer = transformerRef.current;

            if (selectedElement) {
                const node = stage.findOne(`#${selectedElement}`);
                if (node) {
                    transformer.nodes([node]);
                }
            } else {
                transformer.nodes([]);
            }
        }
    }, [selectedElement]);

    // Handle mouse down
    const handleMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
        const stage = e.target.getStage();
        if (!stage) return;

        const pos = stage.getPointerPosition();
        if (!pos) return;

        // If clicking on stage background
        if (e.target === e.target.getStage()) {
            onElementSelect(null);

            // Start drawing if brush tool selected
            if (selectedTool === 'brush') {
                startDrawing(pos.x, pos.y);
            }
        }
    };

    // Handle mouse move
    const handleMouseMove = (e: Konva.KonvaEventObject<MouseEvent>) => {
        if (!isDrawing || selectedTool !== 'brush') return;

        const stage = e.target.getStage();
        if (!stage) return;

        const pos = stage.getPointerPosition();
        if (!pos) {
            continueDrawing(pos.x, pos.y);
        }
    };

    // Handle mouse up
    const handleMouseUp = () => {
        if (isDrawing && selectedTool === 'brush') {
            endDrawing();
        }
    };

    // Render element based on type
    const renderElement = (element: CanvasElement) => {
        const isSelected = element.id === selectedElement;
        const commonProps = {
            id: element.id,
            x: element.x,
            y: element.y,
            rotation: element.rotation,
            scaleX: element.scaleX,
            scaleY: element.scaleY,
            opacity: element.opacity,
            draggable: selectedTool === 'select',
            onClick: () => onElementSelect(element.id),
            onTap: () => onElementSelect(element.id),
            onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => {
                updateElement(element.id, {
                    x: e.target.x(),
                    y: e.target.y(),
                });
            },
            onTransformEnd: (e: Konva.KonvaEventObject<Event>) => {
                const node = e.target;
                updateElement(element.id, {
                    x: node.x(),
                    y: node.y(),
                    rotation: node.rotation(),
                    scaleX: node.scaleX(),
                    scaleY: node.scaleY(),
                });
            },
        };

        switch (element.type) {
            case 'text':
                return (
                    <Text
                        key={element.id}
                        {...commonProps}
                        text={element.data.text}
                        fontSize={element.data.fontSize}
                        fontFamily={element.data.fontFamily}
                        fill={element.data.fill}
                        align={element.data.align}
                        fontStyle={element.data.fontStyle}
                    />
                );

            case 'drawing':
                return (
                    <Line
                        key={element.id}
                        {...commonProps}
                        points={element.data.points}
                        stroke={element.data.stroke}
                        strokeWidth={element.data.strokeWidth}
                        tension={0.5}
                        lineCap="round"
                        lineJoin="round"
                    />
                );

            case 'shape':
                if (element.data.shapeType === 'rectangle') {
                    return (
                        <Rect
                            key={element.id}
                            {...commonProps}
                            width={element.width}
                            height={element.height}
                            fill={element.data.fill}
                            stroke={element.data.stroke}
                            strokeWidth={element.data.strokeWidth}
                        />
                    );
                } else if (element.data.shapeType === 'circle') {
                    return (
                        <Circle
                            key={element.id}
                            {...commonProps}
                            radius={element.width / 2}
                            fill={element.data.fill}
                            stroke={element.data.stroke}
                            strokeWidth={element.data.strokeWidth}
                        />
                    );
                }
                break;

            default:
                return null;
        }
    };

    return (
        <div ref={containerRef} className="w-full h-full bg-gray-50">
            <Stage
                ref={stageRef}
                width={stageSize.width}
                height={stageSize.height}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
            >
                <Layer>
                    {/* Background */}
                    <Rect
                        x={0}
                        y={0}
                        width={stageSize.width}
                        height={stageSize.height}
                        fill="#ffffff"
                    />

                    {/* Render all elements */}
                    {elements.map(renderElement)}

                    {/* Current drawing line */}
                    {isDrawing && currentDrawingPoints.length > 0 && (
                        <Line
                            points={currentDrawingPoints}
                            stroke="#000000"
                            strokeWidth={3}
                            tension={0.5}
                            lineCap="round"
                            lineJoin="round"
                        />
                    )}

                    {/* Transformer for selected elements */}
                    <Transformer
                        ref={transformerRef}
                        boundBoxFunc={(oldBox, newBox) => {
                            // Limit resize
                            if (newBox.width < 5 || newBox.height < 5) {
                                return oldBox;
                            }
                            return newBox;
                        }}
                    />
                </Layer>
            </Stage>
        </div>
    );
}
