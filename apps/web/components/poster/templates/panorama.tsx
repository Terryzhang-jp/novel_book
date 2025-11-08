/**
 * 电影感全景模板
 * 特点：宽银幕、时间刻度、信息胶囊
 */

import type { PosterData } from '@/lib/poster/types';

interface PanoramaTemplateProps {
  data: PosterData;
  id?: string;
}

export function PanoramaTemplate({ data, id }: PanoramaTemplateProps) {
  const timeline = [
    { label: 'ORIGIN', value: data.location || 'Unknown longitude' },
    { label: 'FIELD NOTE', value: data.description || 'Wind carries the whole story across the valley.' },
    { label: 'TIME', value: data.date || 'Golden hour pending' },
  ];

  return (
    <div
      id={id}
      className="relative"
      style={{ width: '1920px', height: '1080px', backgroundColor: '#05060a' }}
    >
      <div className="absolute inset-0 flex items-center justify-center px-16">
        <div className="relative w-full h-[760px] rounded-[48px] overflow-hidden border border-white/10">
          <img
            src={data.photoUrl}
            alt={data.title || '海报'}
            className="w-full h-full object-cover"
            crossOrigin="anonymous"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black via-transparent to-black" style={{ opacity: 0.55 }} />

          <div className="absolute top-10 left-12 right-12 flex items-center justify-between text-white/70 text-xs uppercase tracking-[0.5em]">
            <span>C I N E M A T I C &nbsp; V I E W</span>
            <span>{data.date || 'ISSUE · 24'}</span>
          </div>

          <div className="absolute bottom-16 left-16 text-white max-w-4xl">
            <div className="text-sm uppercase tracking-[0.4em] text-white/70">TRAVEL SCENE</div>
            <h1 className="text-6xl font-semibold leading-tight mt-4">
              {data.description || 'Writing horizons in a single frame'}
            </h1>
          </div>
        </div>
      </div>

      {/* 下方时间轴 */}
      <div className="absolute bottom-10 left-16 right-16">
        <div className="grid grid-cols-3 gap-12">
          {timeline.map((item) => (
            <div
              key={item.label}
              className="bg-white/5 backdrop-blur border border-white/10 rounded-3xl px-8 py-6 text-white"
            >
              <div className="text-xs uppercase tracking-[0.5em] text-white/60">{item.label}</div>
              <div className="text-xl font-semibold mt-3 leading-snug text-white/90">
                {item.value}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-6 h-0.5 bg-gradient-to-r from-transparent via-white/30 to-transparent" />
      </div>
    </div>
  );
}
