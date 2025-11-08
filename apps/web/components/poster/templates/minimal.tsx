/**
 * 极简浮影模板
 * 特点：悬浮卡片、柔和留白、信息化时间线
 */

import type { PosterData } from '@/lib/poster/types';

interface MinimalTemplateProps {
  data: PosterData;
  id?: string;
}

export function MinimalTemplate({ data, id }: MinimalTemplateProps) {
  const infoItems = [
    { label: 'LOCATION', value: data.location || 'Somewhere inspiring' },
    { label: 'DATE', value: data.date || 'In this moment' },
    { label: 'CAMERA', value: data.camera || 'Captured by you' },
  ];

  return (
    <div
      id={id}
      className="relative"
      style={{
        width: '1080px',
        height: '1080px',
        background: 'linear-gradient(145deg, #f7f8fb 0%, #eceff4 40%, #fdfdfd 100%)',
      }}
    >
      <div
        className="absolute inset-0 opacity-[0.15]"
        style={{
          backgroundImage:
            'radial-gradient(circle at 1px 1px, rgba(0,0,0,0.25) 1px, transparent 0)',
          backgroundSize: '18px 18px',
        }}
      />

      <div className="absolute inset-0 flex items-center justify-center p-16">
        <div
          className="relative w-full max-w-[860px] h-[900px] bg-white/90 rounded-[48px] px-16 py-14 flex flex-col gap-10"
          style={{
            boxShadow:
              '0 40px 80px -40px rgba(15, 23, 42, 0.35), 0 20px 40px -30px rgba(15, 23, 42, 0.25)',
            backdropFilter: 'blur(12px)',
          }}
        >
          <div className="absolute -top-6 left-24 right-24 h-2 rounded-full bg-gradient-to-r from-gray-200 via-gray-100 to-white" />

          <div className="relative h-[520px] rounded-[32px] overflow-hidden">
            <img
              src={data.photoUrl}
              alt={data.title || '海报'}
              className="w-full h-full object-cover"
              crossOrigin="anonymous"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/30" />
            <div className="absolute top-6 left-6 bg-white/85 backdrop-blur px-4 py-1.5 rounded-full text-xs font-semibold tracking-[0.35em] text-gray-800">
              {data.title || 'TRAVEL NOTE'}
            </div>
          </div>

          <div className="space-y-5 text-gray-900">
            {data.description && (
              <p className="text-2xl leading-relaxed font-light line-clamp-3">
                {data.description}
              </p>
            )}
            <div className="flex items-center gap-3 text-gray-500 text-xs tracking-[0.3em] uppercase">
              <span className="h-px flex-1 bg-gray-200" />
              Journey Timeline
              <span className="h-px flex-1 bg-gray-200" />
            </div>

            <div className="grid grid-cols-3 gap-5">
              {infoItems.map((item) => (
                <div key={item.label} className="space-y-2">
                  <div className="text-[11px] text-gray-500 tracking-[0.3em]">{item.label}</div>
                  <div className="text-lg font-semibold text-gray-800 leading-snug">
                    {item.value}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
