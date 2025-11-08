/**
 * 旅行明信片模板
 * 特点：纸质纹理、邮戳元素、手写笔记
 */

import type { PosterData } from '@/lib/poster/types';

interface PolaroidTemplateProps {
  data: PosterData;
  id?: string;
}

export function PolaroidTemplate({ data, id }: PolaroidTemplateProps) {
  return (
    <div
      id={id}
      className="relative"
      style={{
        width: '1080px',
        height: '1350px',
        background: 'linear-gradient(120deg, #f8f1e1 0%, #f1ead8 60%, #fefbf5 100%)',
      }}
    >
      <div
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage:
            'repeating-linear-gradient(0deg, transparent, transparent 6px, rgba(0,0,0,0.04) 6px, rgba(0,0,0,0.04) 7px)',
        }}
      />

      <div className="absolute inset-0 px-16 py-20">
        <div
          className="relative h-full w-full bg-[#fffdf6] rounded-[48px] border border-amber-100 shadow-2xl overflow-hidden"
          style={{
            boxShadow: '0 40px 60px -35px rgba(101, 75, 36, 0.45)',
          }}
        >
          <div className="absolute top-10 right-20 w-40 h-40 rounded-full border-2 border-amber-400/70 text-amber-500 uppercase text-xs font-semibold tracking-[0.5em] flex items-center justify-center">
            TRAVEL MAIL
          </div>

          <div className="absolute top-10 left-1/2 -translate-x-1/2 w-40 h-8 bg-amber-200/40 rotate-2 rounded-sm" />
          <div className="absolute top-16 left-1/2 -translate-x-1/2 w-48 h-10 bg-amber-100/60 -rotate-3 rounded-sm" />

          <div className="relative h-full grid grid-cols-[0.95fr_1.05fr] gap-12 p-16">
            {/* 左侧照片 */}
            <div className="relative flex items-center justify-center">
              <div className="absolute -left-6 -top-4 w-24 h-6 bg-amber-100/70 rotate-[-8deg]" />
              <div className="absolute -right-3 top-10 w-16 h-6 bg-amber-100/70 rotate-6" />
              <div className="relative w-full h-full bg-white rounded-[32px] border border-amber-50 shadow-lg overflow-hidden">
                <img
                  src={data.photoUrl}
                  alt={data.title || '海报'}
                  className="w-full h-full object-cover"
                  crossOrigin="anonymous"
                />
                <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black/60 to-transparent" />
                <div className="absolute bottom-6 left-6 text-white tracking-[0.4em] text-xs uppercase">
                  {data.location || 'ON THE ROAD'}
                </div>
              </div>
            </div>

            {/* 右侧书写区域 */}
            <div className="relative">
              <div className="absolute inset-0 border-l border-dashed border-amber-200" />
              <div className="relative h-full pl-8">
                <div className="flex items-center justify-between mb-10 text-xs tracking-[0.8em] text-amber-700">
                  <span>POSTCARD</span>
                  <span>{data.date || 'UNSENT'}</span>
                </div>

                {data.description && (
                  <p
                    className="text-2xl text-amber-900 leading-relaxed mb-10 line-clamp-6"
                    style={{ fontFamily: "'Caveat', cursive" }}
                  >
                    {data.description}
                  </p>
                )}

                <div className="space-y-6 text-lg text-amber-800" style={{ fontFamily: "'Caveat', cursive" }}>
                  <div className="flex items-center gap-3">
                    <span>📍</span>
                    <span>{data.location || '待寄出的地址'}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span>🕰</span>
                    <span>{data.date || '写在旅途的某一天'}</span>
                  </div>
                </div>

                <div className="absolute bottom-6 right-4 text-right text-sm tracking-[0.5em] text-amber-500">
                  {data.title || 'DEAR FUTURE ME'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
