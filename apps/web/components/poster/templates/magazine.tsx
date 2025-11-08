/**
 * 旅程杂志封面模板
 * 特点：左右分栏、粗体标题、杂志元素
 */

import type { PosterData } from '@/lib/poster/types';

interface MagazineTemplateProps {
  data: PosterData;
  id?: string;
}

export function MagazineTemplate({ data, id }: MagazineTemplateProps) {
  const headline = data.description || data.title || 'A QUIET PLACE TO BREATHE';

  const metaItems = [
    { label: 'LOCATION', value: data.location || 'UNLISTED COORDINATES' },
    { label: 'DATE', value: data.date || 'SEASON UNKNOWN' },
    { label: 'CAMERA', value: data.camera || 'TRAVEL NOTEBOOK' },
  ];

  return (
    <div
      id={id}
      className="relative"
      style={{ width: '1920px', height: '1080px', backgroundColor: '#090c15' }}
    >
      <div className="absolute inset-0 grid grid-cols-[1.15fr_0.85fr]">
        {/* 左页：全幅主图 */}
        <div className="relative overflow-hidden rounded-r-[80px]">
          <img
            src={data.photoUrl}
            alt={data.title || '海报'}
            className="w-full h-full object-cover"
            crossOrigin="anonymous"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
          <div className="absolute top-16 left-16 text-white/70 uppercase tracking-[0.6em] text-xs flex items-center gap-4">
            <span className="h-px w-16 bg-white/70" />
            FIELD NOTES
          </div>
          <div className="absolute bottom-20 left-16 text-white space-y-4">
            <p className="text-6xl font-black tracking-tight leading-[1.05] max-w-xl">
              {headline}
            </p>
            <p className="text-sm uppercase tracking-[0.4em] text-white/60">
              Volume 07 · Travel Editorial
            </p>
          </div>
        </div>

        {/* 右页：信息页 */}
        <div className="relative bg-[#fbfbfc] text-gray-900 px-20 py-16 flex flex-col">
          <div className="flex items-center justify-between text-xs tracking-[0.6em] uppercase text-gray-500">
            <span>TRAVEL JOURNAL</span>
            <span>{data.date || 'ISSUE 07'}</span>
          </div>
          <div className="mt-12 space-y-8">
            <div className="space-y-3">
              <div className="text-sm text-gray-400 tracking-[0.4em]">COVER STORY</div>
              <div className="text-4xl font-bold leading-tight">{data.title || 'Wandering Lines'}</div>
            </div>
            <p className="text-xl text-gray-600 leading-relaxed line-clamp-5">
              {data.description ||
                'Collecting quiet scenes along the road — the way the light folds over distant hills, the smell of salt clinging to hair, the long notes of a city waking up.'}
            </p>
          </div>

          <div className="mt-auto pt-12 border-t border-gray-200">
            <div className="grid grid-cols-1 gap-6 text-sm tracking-[0.3em] text-gray-500">
              {metaItems.map((item) => (
                <div key={item.label} className="flex flex-col">
                  <span>{item.label}</span>
                  <span className="text-lg tracking-normal text-gray-900 font-semibold mt-2">
                    {item.value}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-10 flex items-center justify-between text-xs uppercase tracking-[0.5em] text-gray-400">
              <span>FEATURED JOURNEY</span>
              <span>TRAVEL ISSUE</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
