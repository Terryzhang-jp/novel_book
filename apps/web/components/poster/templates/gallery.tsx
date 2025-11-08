/**
 * 艺术画册模板
 * 特点：翻页布局、分栏文字、精致坐标
 */

import type { PosterData } from '@/lib/poster/types';

interface GalleryTemplateProps {
  data: PosterData;
  id?: string;
}

export function GalleryTemplate({ data, id }: GalleryTemplateProps) {
  const coordsText = data.coordinates
    ? `${data.coordinates.latitude.toFixed(2)}°N / ${data.coordinates.longitude.toFixed(2)}°E`
    : 'Coordinates to be mapped';

  return (
    <div
      id={id}
      className="relative"
      style={{ width: '1080px', height: '1080px', backgroundColor: '#e9e3da' }}
    >
      <div
        className="absolute inset-0 opacity-60"
        style={{
          backgroundImage:
            'linear-gradient(90deg, rgba(0,0,0,0.03) 1px, transparent 1px), linear-gradient(rgba(0,0,0,0.03) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      <div className="absolute inset-0 px-16 py-14">
        <div className="relative w-full h-full rounded-[60px] bg-[#fdfbfa] border border-amber-50 shadow-[0_50px_80px_-60px_rgba(15,23,42,0.65)] overflow-hidden">
          <div className="absolute inset-y-12 left-1/2 w-px bg-gradient-to-b from-transparent via-amber-100 to-transparent" />

          <div className="grid grid-cols-2 h-full">
            {/* 左页 */}
            <div className="relative px-16 py-20 flex flex-col gap-8 text-gray-900">
              <div className="text-sm uppercase tracking-[0.5em] text-amber-400">TRAVEL EDITION</div>
              <div className="space-y-3">
                <h1 className="text-6xl font-serif leading-tight">
                  {data.title || 'Atlas of Soft Afternoons'}
                </h1>
                <p className="text-base tracking-[0.4em] text-gray-500 uppercase">
                  {data.location || 'UNTITLED PLACE'}
                </p>
              </div>
              <p className="text-xl text-gray-600 leading-relaxed line-clamp-5">
                {data.description ||
                  'A collection of light and silence curated from a single afternoon. The pages keep the hum of cicadas and the echo of distant trains.'}
              </p>
              <div className="mt-auto space-y-3 text-sm uppercase tracking-[0.4em] text-gray-500">
                <div>COORDINATES — {coordsText}</div>
                <div>RECORDED — {data.date || 'UNDATED'}</div>
              </div>
            </div>

            {/* 右页 */}
            <div className="relative">
              <div className="absolute inset-10 rounded-[48px] overflow-hidden shadow-2xl">
                <img
                  src={data.photoUrl}
                  alt={data.title || '海报'}
                  className="w-full h-full object-cover"
                  crossOrigin="anonymous"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" />
                <div className="absolute bottom-10 left-10 text-white text-xs uppercase tracking-[0.5em]">
                  Volume 03 · Gallery Series
                </div>
              </div>
              <div className="absolute top-16 right-12 text-right text-xs uppercase tracking-[0.5em] text-gray-400">
                STORIES IN PAPER
                <br />
                {new Date().getFullYear()}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
