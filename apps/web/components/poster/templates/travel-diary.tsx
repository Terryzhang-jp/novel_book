/**
 * 地图拼贴旅行模板
 * 特点：牛皮纸底、地形纹理、多层拼贴
 */

import type { PosterData } from '@/lib/poster/types';

interface TravelDiaryTemplateProps {
  data: PosterData;
  id?: string;
}

export function TravelDiaryTemplate({ data, id }: TravelDiaryTemplateProps) {
  return (
    <div
      id={id}
      className="relative"
      style={{ width: '1080px', height: '1350px', backgroundColor: '#f1e3cf' }}
    >
      <div
        className="absolute inset-0 opacity-50"
        style={{
          backgroundImage:
            'url("data:image/svg+xml,%3Csvg width=\'160\' height=\'160\' viewBox=\'0 0 160 160\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cpath d=\'M0 40 Q40 20 80 40 T160 40 V0 H0 Z\' fill=\'%23f5ead7\'/%3E%3C/svg%3E")',
        }}
      />

      <div className="absolute inset-0 px-14 py-16">
        <div className="relative w-full h-full rounded-[48px] bg-[#fff8ea] border border-amber-100 shadow-[0_40px_70px_-50px_rgba(120,72,34,0.8)] overflow-hidden">
          {/* 地图纹理 */}
          <div
            className="absolute inset-0 opacity-30 mix-blend-multiply"
            style={{
              backgroundImage:
                'linear-gradient(60deg, rgba(149, 128, 99, 0.2) 25%, transparent 25%), linear-gradient(-60deg, rgba(149, 128, 99, 0.15) 25%, transparent 25%)',
              backgroundSize: '120px 120px',
            }}
          />

          {/* 主内容 */}
          <div className="relative h-full p-16 flex flex-col gap-10">
            <div className="flex-1 grid grid-cols-[1.1fr_0.9fr] gap-12">
              <div className="relative">
                <div className="absolute -top-4 left-12 w-32 h-10 bg-amber-100/70 rotate-[-6deg]" />
                <div className="absolute -top-1 right-16 w-28 h-8 bg-amber-100/50 rotate-5" />
                <div className="relative h-full rounded-[40px] overflow-hidden border-[10px] border-white shadow-2xl">
                  <img
                    src={data.photoUrl}
                    alt={data.title || '海报'}
                    className="w-full h-full object-cover"
                    crossOrigin="anonymous"
                  />
                  <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/45" />
                  <div className="absolute bottom-6 left-6 text-white uppercase tracking-[0.6em] text-xs">
                    {data.location || 'IN TRANSIT'}
                  </div>
                </div>
              </div>

              <div className="relative bg-white/90 rounded-[36px] border border-amber-100 p-10 shadow-lg">
                <div className="flex items-center justify-between text-xs uppercase tracking-[0.5em] text-amber-500 mb-8">
                  <span>FIELD NOTES</span>
                  <span>{data.date || 'UNRECORDED'}</span>
                </div>
                <div className="space-y-6 text-amber-900" style={{ fontFamily: "'Caveat', cursive" }}>
                  <p className="text-3xl leading-relaxed line-clamp-6">
                    {data.description ||
                      'Pinned another memory to the map today — the color of the air and a promise to return.'}
                  </p>
                  <div className="flex flex-col gap-2 text-2xl">
                    <span>✈ {data.location || 'Where the light was kind'}</span>
                    <span>🗓 {data.date || 'Someday soon'}</span>
                  </div>
                </div>

                <div className="absolute -bottom-6 right-10 bg-amber-50 border border-dashed border-amber-300 text-amber-700 text-xs uppercase tracking-[0.3em] px-6 py-3 shadow-md rotate-3">
                  MAP PIN ADDED
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-6 text-sm text-amber-700 uppercase tracking-[0.4em]">
              <div className="bg-white/90 rounded-[24px] p-6 border border-amber-100">
                <div>LAT / LNG</div>
                <div className="text-xl tracking-normal text-amber-900 font-semibold mt-3">
                  {data.coordinates
                    ? `${data.coordinates.latitude.toFixed(2)} · ${data.coordinates.longitude.toFixed(2)}`
                    : 'NOTED ON PAPER'}
                </div>
              </div>
              <div className="bg-white/90 rounded-[24px] p-6 border border-amber-100">
                <div>TEMPERATURE</div>
                <div className="text-xl tracking-normal text-amber-900 font-semibold mt-3">
                  SWEATER WEATHER
                </div>
              </div>
              <div className="bg-white/90 rounded-[24px] p-6 border border-amber-100">
                <div>TRAVEL MODE</div>
                <div className="text-xl tracking-normal text-amber-900 font-semibold mt-3">
                  OPEN ENDED
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
