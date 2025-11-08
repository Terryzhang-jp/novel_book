/**
 * 旅程故事线模板
 * 特点：时间轴、章节排版、纸质质感
 */

import type { PosterData } from '@/lib/poster/types';

interface VintageTemplateProps {
  data: PosterData;
  id?: string;
}

export function VintageTemplate({ data, id }: VintageTemplateProps) {
  const timeline = [
    {
      title: 'Chapter 01 · Departure',
      content: data.location || '坐标待定，心之所向。',
    },
    {
      title: 'Chapter 02 · Field Notes',
      content:
        data.description ||
        '路上收集的所有风声与气味，写进翻动的日记里。',
    },
    {
      title: 'Chapter 03 · Arrival',
      content: data.date || '在抵达之前，时间只是背景声。',
    },
  ];

  return (
    <div
      id={id}
      className="relative"
      style={{ width: '1080px', height: '1080px', backgroundColor: '#f7f1e6' }}
    >
      <div
        className="absolute inset-0 opacity-50"
        style={{
          backgroundImage:
            'linear-gradient(90deg, rgba(0,0,0,0.03) 1px, transparent 1px), linear-gradient(rgba(0,0,0,0.03) 1px, transparent 1px)',
          backgroundSize: '36px 36px',
        }}
      />

      <div className="absolute inset-0 p-14 grid grid-cols-[1.05fr_0.95fr] gap-12">
        {/* 照片章节 */}
        <div className="relative bg-white rounded-[40px] overflow-hidden shadow-[0_40px_80px_-50px_rgba(15,23,42,0.6)]">
          <img
            src={data.photoUrl}
            alt={data.title || '海报'}
            className="w-full h-full object-cover"
            crossOrigin="anonymous"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/35" />
          <div className="absolute bottom-10 left-10 text-white space-y-3">
            <p className="text-xs uppercase tracking-[0.6em] text-white/70">TRAVEL STORYLINE</p>
            <h2 className="text-4xl font-semibold max-w-lg leading-snug">
              {data.title || 'Stories written between cities'}
            </h2>
          </div>
        </div>

        {/* 时间轴 */}
        <div className="relative bg-white/90 rounded-[40px] border border-amber-100 px-16 py-14 overflow-hidden">
          <div className="absolute inset-y-12 left-10 w-px bg-gradient-to-b from-transparent via-amber-200 to-transparent" />
          <div className="space-y-10">
            {timeline.map((node, index) => (
              <div key={node.title} className="relative pl-12">
                <div
                  className="absolute left-[-2px] top-1 w-3 h-3 rounded-full border-2 border-amber-400 bg-white"
                  style={{ boxShadow: '0 0 0 6px rgba(251, 191, 36, 0.25)' }}
                />
                <div className="text-xs uppercase tracking-[0.4em] text-amber-500">
                  {`0${index + 1}`}
                </div>
                <div className="text-xl font-semibold text-gray-900 mt-2">
                  {node.title}
                </div>
                <p className="text-base text-gray-600 leading-relaxed mt-3 line-clamp-3">
                  {node.content}
                </p>
              </div>
            ))}
          </div>

          <div className="absolute bottom-10 left-16 text-xs uppercase tracking-[0.5em] text-gray-400">
            JOURNEY · {data.date || 'ENDLESS'}
          </div>
        </div>
      </div>
    </div>
  );
}
