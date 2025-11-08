/**
 * 城市行程纵向模板
 * 特点：竖屏故事线、柔和渐变、行程节点
 */

import type { PosterData } from '@/lib/poster/types';

interface ModernTemplateProps {
  data: PosterData;
  id?: string;
}

export function ModernTemplate({ data, id }: ModernTemplateProps) {
  const itinerary = [
    {
      label: 'Stop 01',
      title: data.location || 'Destination pending',
      detail:
        data.coordinates
          ? `${data.coordinates.latitude.toFixed(2)}° · ${data.coordinates.longitude.toFixed(2)}°`
          : 'Coordinates to be discovered',
    },
    {
      label: 'Stop 02',
      title: 'Field Notes',
      detail:
        data.description ||
        'Observations scribbled between cups of coffee and windows fogged by rain.',
    },
    {
      label: 'Stop 03',
      title: 'Time Stamp',
      detail: data.date || 'Recorded somewhere after dusk',
    },
  ];

  return (
    <div
      id={id}
      className="relative"
      style={{
        width: '1080px',
        height: '1920px',
        background: 'linear-gradient(180deg, #f5f1e8 0%, #e6ecef 45%, #f8f9fb 100%)',
      }}
    >
      <div
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            'radial-gradient(circle at 1px 1px, rgba(15,23,42,0.08) 1px, transparent 0)',
          backgroundSize: '28px 28px',
        }}
      />

      <div className="relative h-full flex flex-col gap-10 px-16 py-20">
        <div className="flex items-center justify-between text-xs uppercase tracking-[0.6em] text-slate-500">
          <span>TRAVEL STORY</span>
          <span>{data.date || 'ISSUE · 24'}</span>
        </div>

        {/* 英雄照片 */}
        <div className="relative rounded-[56px] overflow-hidden h-[960px] shadow-[0_50px_100px_-60px_rgba(15,23,42,0.8)]">
          <img
            src={data.photoUrl}
            alt={data.title || '海报'}
            className="w-full h-full object-cover"
            crossOrigin="anonymous"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/50" />
          <div className="absolute bottom-12 left-12 text-white space-y-4 max-w-xl">
            <div className="text-xs uppercase tracking-[0.5em] text-white/70">
              JOURNEY CHRONICLE
            </div>
            <h1 className="text-5xl font-semibold leading-tight">
              {data.description || 'Stories told when the city finally exhales'}
            </h1>
          </div>
        </div>

        {/* 行程节点 */}
        <div className="relative bg-white/90 rounded-[48px] border border-slate-100 px-16 py-14">
          <div className="absolute inset-y-12 left-12 w-px bg-gradient-to-b from-transparent via-slate-200 to-transparent" />
          <div className="space-y-10">
            {itinerary.map((stop, index) => (
              <div key={stop.label} className="relative pl-16">
                <div
                  className="absolute left-7 top-2 w-3.5 h-3.5 rounded-full bg-slate-900"
                  style={{ boxShadow: '0 0 0 6px rgba(15,23,42,0.12)' }}
                />
                <div className="text-xs uppercase tracking-[0.4em] text-slate-400">
                  {stop.label}
                </div>
                <div className="text-2xl font-semibold text-slate-900 mt-2">{stop.title}</div>
                <p className="text-base text-slate-600 leading-relaxed mt-2 line-clamp-3">
                  {stop.detail}
                </p>
                {index !== itinerary.length - 1 && <div className="mt-8 h-px bg-slate-100" />}
              </div>
            ))}
          </div>
        </div>

        {/* 信息行 */}
        <div className="grid grid-cols-2 gap-6 text-sm uppercase tracking-[0.4em] text-slate-400">
          <div className="bg-white/90 rounded-3xl p-8 border border-slate-100">
            <div>LOCATION</div>
            <div className="text-xl tracking-normal text-slate-900 font-semibold mt-3">
              {data.location || 'To be found'}
            </div>
          </div>
          <div className="bg-white/90 rounded-3xl p-8 border border-slate-100">
            <div>CAMERA</div>
            <div className="text-xl tracking-normal text-slate-900 font-semibold mt-3">
              {data.camera || 'Handwritten memory'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
