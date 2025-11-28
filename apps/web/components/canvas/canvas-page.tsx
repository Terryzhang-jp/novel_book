/**
 * Canvas Page Component
 * 
 * Individual journal page with photos and text
 */

'use client';

import { useRef } from 'react';
import { Stage, Layer, Rect, Image as KonvaImage, Text } from 'react-konva';
import useImage from 'use-image';

interface CanvasPageProps {
    pageNumber: number;
}

export function CanvasPage({ pageNumber }: CanvasPageProps) {
    const stageRef = useRef(null);

    return (
        <div className="w-full h-full relative">
            <Stage width={800} height={600} ref={stageRef}>
                <Layer>
                    {/* Paper Background */}
                    <Rect
                        x={0}
                        y={0}
                        width={800}
                        height={600}
                        fill="#ffffff"
                    />

                    {/* Placeholder content */}
                    <Text
                        x={50}
                        y={50}
                        text={`Page ${pageNumber}`}
                        fontSize={24}
                        fontFamily="Arial"
                        fill="#cccccc"
                    />

                    {/* Demo text */}
                    <Text
                        x={50}
                        y={100}
                        text="Click 'Photo' to add images"
                        fontSize={16}
                        fontFamily="Arial"
                        fill="#999999"
                    />

                    <Text
                        x={50}
                        y={130}
                        text="Click 'Text' to add text boxes"
                        fontSize={16}
                        fontFamily="Arial"
                        fill="#999999"
                    />
                </Layer>
            </Stage>
        </div>
    );
}
