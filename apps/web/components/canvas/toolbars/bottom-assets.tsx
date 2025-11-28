/**
 * Bottom Assets Bar - Stickers, Photos, Backgrounds
 */

'use client';

import { Image, Smile, Palette, ChevronUp, ChevronDown } from 'lucide-react';
import { useState } from 'react';

export function BottomAssets() {
    const [isExpanded, setIsExpanded] = useState(false);

    return (
        <div className="absolute bottom-0 left-0 right-0 bg-white border-t border-gray-200 transition-all duration-300"
            style={{ height: isExpanded ? '200px' : '48px' }}
        >
            {/* Toggle Button */}
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-full bg-white border border-gray-200 border-b-0 rounded-t-lg px-3 py-1 hover:bg-gray-50"
            >
                {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            </button>

            {/* Tabs */}
            <div className="flex items-center gap-4 px-4 h-12 border-b border-gray-200">
                <button className="flex items-center gap-2 text-sm font-medium text-blue-600 border-b-2 border-blue-600 pb-1">
                    <Image className="w-4 h-4" />
                    Photos
                </button>
                <button className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900">
                    <Smile className="w-4 h-4" />
                    Stickers
                </button>
                <button className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900">
                    <Palette className="w-4 h-4" />
                    Backgrounds
                </button>
            </div>

            {/* Content */}
            {isExpanded && (
                <div className="p-4 overflow-y-auto" style={{ height: 'calc(200px - 48px)' }}>
                    <div className="grid grid-cols-6 gap-2">
                        {/* Asset items will be rendered here */}
                        <div className="text-center text-gray-400 text-sm col-span-6 mt-4">
                            Click to add photos from your gallery
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
