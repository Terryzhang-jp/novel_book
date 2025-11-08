/**
 * 记忆拼贴模板
 * 特点：多图 Moodboard、便签元素、胶片质感
 */

import type { CSSProperties } from 'react';
import type { PosterData } from '@/lib/poster/types';

interface FilmTemplateProps {
  data: PosterData;
  id?: string;
}

const cropPositions: Array<CSSProperties['objectPosition']> = [
  'center',
  'top',
  'center bottom',
];

export function FilmTemplate({ data, id }: FilmTemplateProps) {
  return (
    <div
      id={id}
      className="relative"
      style={{ width: '1920px', height: '1080px', backgroundColor: '#f2f3f7' }}
    >
      <div className="absolute inset-0 px-16 py-14">
        <div className="relative w-full h-full rounded-[56px] bg-white shadow-[0_80px_120px_-80px_rgba(15,23,42,0.7)] p-14 grid grid-cols-[1.2fr_0.8fr] gap-12 overflow-hidden">
          {/* 拼贴区域 */}
          <div className="relative bg-slate-900 rounded-[40px] overflow-hidden">
            <img
              src={data.photoUrl}
              alt={data.title || '海报'}
              className="w-full h-full object-cover opacity-90"
              crossOrigin="anonymous"
            />
            <div className="absolute inset-0 bg-gradient-to-br from-black/60 via-transparent to-transparent" />

            {/* 叠加小图 */}
            <div className="absolute top-12 right-12 grid gap-6">
              {cropPositions.map((pos, idx) => (
                <div
                  key={pos as string}
                  className="w-48 h-32 rounded-2xl overflow-hidden border-4 border-white shadow-2xl bg-white/30 backdrop-blur rotate-2"
                  style={{
                    transform: `rotate(${idx === 0 ? -4 : idx === 1 ? 3 : -2}deg)`,
                  }}
                >
                  <img
                    src={data.photoUrl}
                    alt={`${data.title || '海报'}-${idx}`}
                    className="w-full h-full object-cover"
                    style={{ objectPosition: pos }}
                    crossOrigin="anonymous"
                  />
                </div>
              ))}
            </div>

            <div className="absolute bottom-10 left-10 text-white">
              <div className="text-xs uppercase tracking-[0.6em] text-white/60">MEMORY BOARD</div>
              <div className="text-4xl font-semibold mt-3 max-w-xl leading-tight">
                {data.description || 'Pieces of the day pinned before they fade'}
              </div>
            </div>
          </div>

          {/* 便签与胶片区 */}
          <div className="relative flex flex-col gap-8">
            <div className="bg-[#fdf6e8] rounded-[32px] p-10 shadow-inner border border-amber-100">
              <div className="text-xs uppercase tracking-[0.5em] text-amber-500">FIELD NOTE</div>
              <p className="text-3xl text-amber-900 leading-relaxed mt-6 line-clamp-5" style={{ fontFamily: "'Caveat', cursive" }}>
                {data.description ||
                  'Remind yourself how the breeze sounded when it crossed the harbor and why you promised to slow down.'}
              </p>
              <div className="mt-10 flex flex-col gap-3 text-sm text-amber-600 uppercase tracking-[0.4em]">
                <span>LOCATION · {data.location || 'OFF THE GRID'}</span>
                <span>DATE · {data.date || 'TO BE FILED'}</span>
              </div>
            </div>

            <div className="flex-1 bg-slate-50 rounded-[32px] border border-slate-200 p-8 flex flex-col gap-6">
              <div className="text-xs uppercase tracking-[0.5em] text-slate-500">
                CONTACT SHEET
              </div>
              <div className="grid grid-cols-3 gap-4 flex-1">
                {Array.from({ length: 6 }).map((_, idx) => (
                  <div
                    key={idx}
                    className="relative bg-black rounded-xl overflow-hidden border border-white/40 shadow-lg"
                  >
                    <img
                      src={data.photoUrl}
                      alt={`${data.title || '海报'}-contact-${idx}`}
                      className="w-full h-full object-cover"
                      style={{ objectPosition: cropPositions[idx % cropPositions.length] }}
                      crossOrigin="anonymous"
                    />
                    <div className="absolute bottom-2 left-3 text-[10px] uppercase tracking-[0.4em] text-white/70">
                      F{idx + 1 < 10 ? `0${idx + 1}` : idx + 1}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between text-xs uppercase tracking-[0.5em] text-slate-400">
                <span>{data.camera || '35MM DIARY'}</span>
                <span>ARCHIVE #{new Date().getFullYear()}</span>
              </div>
            </div>
          </div>

          {/* 颗粒质感 */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage:
                'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noise\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'2.4\' numOctaves=\'2\'/%3E%3C/filter%3E%3Crect width=\'200\' height=\'200\' filter=\'url(%23noise)\' opacity=\'0.08\'/%3E%3C/svg%3E")',
            }}
          />
        </div>
      </div>
    </div>
  );
}
