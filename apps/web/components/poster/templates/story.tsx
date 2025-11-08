/**
 * 日落故事模板
 * 特点：社交故事比例、分段叙事、柔和渐变
 */

import type { PosterData } from '@/lib/poster/types';

interface StoryTemplateProps {
  data: PosterData;
  id?: string;
}

export function StoryTemplate({ data, id }: StoryTemplateProps) {
  const storyBlocks = [
    {
      title: 'Dawn',
      content: data.location || 'Woke up somewhere between maps.',
    },
    {
      title: 'Noon',
      content:
        data.description ||
        'Collected a handful of light, a whisper of wind, and tucked them into the notes app.',
    },
    {
      title: 'Dusk',
      content: data.date || 'Time suspended at golden hour.',
    },
  ];

  return (
    <div
      id={id}
      className="relative"
      style={{
        width: '1080px',
        height: '1920px',
        background: 'linear-gradient(160deg, #0f172a 0%, #1f2937 45%, #f4c38f 120%)',
      }}
    >
      <div className="absolute inset-0 px-14 py-16 flex flex-col gap-10">
        <div className="flex items-center justify-between text-xs uppercase tracking-[0.6em] text-white/70">
          <span>STORYLINE</span>
          <span>{data.title || 'ISSUE 09'}</span>
        </div>

        <div className="relative flex-1 rounded-[60px] overflow-hidden shadow-[0_80px_120px_-80px_rgba(0,0,0,0.9)]">
          <img
            src={data.photoUrl}
            alt={data.title || '海报'}
            className="w-full h-full object-cover"
            crossOrigin="anonymous"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/10 to-black/70" />
          <div className="absolute top-10 left-10 bg-white/20 text-white text-xs uppercase tracking-[0.4em] px-6 py-3 rounded-full backdrop-blur-lg">
            LIVE FROM THE ROAD
          </div>
        </div>

        <div className="bg-white/95 rounded-[48px] border border-white/30 shadow-2xl p-12 flex flex-col gap-8">
          <div className="text-sm uppercase tracking-[0.5em] text-gray-400">DAY NOTES</div>
          <div className="grid gap-8">
            {storyBlocks.map((block) => (
              <div key={block.title}>
                <div className="text-xs uppercase tracking-[0.4em] text-gray-400">{block.title}</div>
                <p className="text-2xl text-gray-900 font-semibold mt-3 leading-relaxed line-clamp-3">
                  {block.content}
                </p>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between text-xs uppercase tracking-[0.5em] text-gray-400">
            <span>{data.location || 'UNPINNED'}</span>
            <span>{data.date || 'NOW'}</span>
          </div>
        </div>

        <div className="flex items-center justify-center text-xs uppercase tracking-[0.5em] text-white/60">
          Swipe • More stories soon
        </div>
      </div>
    </div>
  );
}
