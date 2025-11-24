/**
 * 摄影专业模板
 * 特点：仿相机参数展示、专业EXIF数据、留白设计
 */

import type { PosterData } from '@/lib/poster/types';

interface PhotographyTemplateProps {
    data: PosterData;
    id?: string;
}

export function PhotographyTemplate({ data, id }: PhotographyTemplateProps) {
    // Default values if EXIF is missing
    const iso = data.exif?.iso || 'ISO 100';
    const aperture = data.exif?.aperture || 'f/2.8';
    const shutterSpeed = data.exif?.shutterSpeed || '1/125s';
    const date = data.date || new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }) + ' ' + new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

    // Camera info
    const cameraMake = data.camera?.split(' ')[0] || 'SONY';
    const cameraModel = data.camera?.replace(cameraMake, '').trim() || 'ILCE-7RM3';
    const lens = data.exif?.lensModel || 'FE 24-70mm F2.8 GM';

    // Dimensions
    const width = data.width || 1080;
    const height = data.height || 1080;
    const footerHeight = 200;

    return (
        <div
            id={id}
            className="relative bg-white"
            style={{
                width: `${width}px`,
                height: `${height}px`,
            }}
        >
            {/* Photo Area */}
            <div
                className="absolute top-0 left-0 right-0 bg-gray-100 overflow-hidden"
                style={{ height: `${height - footerHeight}px` }}
            >
                <img
                    src={data.photoUrl}
                    alt={data.title || 'Photography'}
                    className="w-full h-full object-cover"
                    crossOrigin="anonymous"
                />
            </div>

            {/* Bottom Info Area */}
            <div
                className="absolute bottom-0 left-0 right-0 bg-white px-10 flex items-center justify-between"
                style={{ height: `${footerHeight}px` }}
            >
                {/* Left: EXIF & Date */}
                <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-3 text-2xl font-bold text-black tracking-tight">
                        <span>{iso}</span>
                        <span>{aperture}</span>
                        <span>{shutterSpeed}</span>
                    </div>
                    <div className="text-lg text-gray-500 font-medium tracking-wide">
                        {date}
                    </div>
                </div>

                {/* Right: Camera Brand & Model */}
                <div className="flex items-center gap-6">
                    {/* Brand Logo (Text representation for now) */}
                    <div className="text-5xl font-serif font-black tracking-tighter text-black">
                        {cameraMake.toUpperCase()}
                    </div>

                    {/* Divider */}
                    <div className="w-px h-12 bg-gray-300" />

                    {/* Model & Lens */}
                    <div className="flex flex-col gap-1 items-start">
                        <div className="text-xl font-bold text-black uppercase tracking-wider">
                            {cameraModel}
                        </div>
                        <div className="text-sm text-gray-500 font-medium tracking-wide">
                            {lens}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
