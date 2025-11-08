'use client';

/**
 * 模板预览网格组件 - 设计师重新设计版
 * 统一高度、现代卡片、优雅交互
 */

import type { TemplateId, PosterTemplate, PosterData } from '@/lib/poster/types';
import { POSTER_TEMPLATES } from '@/lib/poster/template-config';
import { TemplateThumbnail } from './template-thumbnail';

interface TemplatePreviewGridProps {
  selectedTemplates: TemplateId[];
  onSelectionChange: (templateIds: TemplateId[]) => void;
  onTemplateClick?: (templateId: TemplateId) => void;
  posterData: PosterData;
}

export function TemplatePreviewGrid({
  selectedTemplates,
  onSelectionChange,
  onTemplateClick,
  posterData,
}: TemplatePreviewGridProps) {
  const handleToggle = (templateId: TemplateId) => {
    if (selectedTemplates.includes(templateId)) {
      onSelectionChange(selectedTemplates.filter((id) => id !== templateId));
    } else {
      onSelectionChange([...selectedTemplates, templateId]);
    }
  };

  const handleSelectAll = () => {
    if (selectedTemplates.length === POSTER_TEMPLATES.length) {
      onSelectionChange([]);
    } else {
      onSelectionChange(POSTER_TEMPLATES.map((t) => t.id));
    }
  };

  const isAllSelected = selectedTemplates.length === POSTER_TEMPLATES.length;

  return (
    <div className="space-y-8">
      {/* 顶部控制栏 */}
      <div className="flex items-center justify-between p-8 bg-gradient-to-r from-card to-card/80 border border-border/50 rounded-2xl shadow-lg backdrop-blur-sm">
        <div className="space-y-1">
          <h3 className="text-2xl font-bold text-foreground tracking-tight">
            选择你喜欢的模板
          </h3>
          <p className="text-sm text-muted-foreground">
            已选择 <span className="font-bold text-primary text-base">{selectedTemplates.length}</span>
            <span className="mx-1.5">/</span>
            <span className="font-medium">{POSTER_TEMPLATES.length}</span> 个模板
          </p>
        </div>
        <button
          onClick={handleSelectAll}
          className="group relative px-8 py-4 text-sm font-bold overflow-hidden rounded-xl transition-all duration-300 hover:scale-105 active:scale-95"
          style={{
            background: isAllSelected
              ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
              : 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
            boxShadow: '0 4px 15px rgba(0, 0, 0, 0.1)'
          }}
        >
          <span className="relative z-10 text-white">
            {isAllSelected ? '取消全选' : '全选模板'}
          </span>
          <div className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity" />
        </button>
      </div>

      {/* 模板网格 - 统一高度 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
        {POSTER_TEMPLATES.map((template) => (
          <TemplateCard
            key={template.id}
            template={template}
            isSelected={selectedTemplates.includes(template.id)}
            onToggle={() => handleToggle(template.id)}
            onClick={() => onTemplateClick?.(template.id)}
            posterData={posterData}
          />
        ))}
      </div>
    </div>
  );
}

interface TemplateCardProps {
  template: PosterTemplate;
  isSelected: boolean;
  onToggle: () => void;
  onClick: () => void;
  posterData: PosterData;
}

function TemplateCard({ template, isSelected, onToggle, onClick, posterData }: TemplateCardProps) {
  const styleLabel = {
    minimal: '极简',
    vintage: '复古',
    modern: '现代',
    artistic: '艺术',
    casual: '休闲',
  }[template.style];

  return (
    <div
      className={`
        group relative rounded-2xl transition-all duration-300 cursor-pointer
        ${
          isSelected
            ? 'ring-4 ring-primary ring-offset-4 ring-offset-background shadow-2xl scale-[1.02]'
            : 'shadow-lg hover:shadow-2xl hover:scale-[1.02] border-2 border-border/50 hover:border-primary/30'
        }
      `}
      onClick={onClick}
      style={{
        height: '450px', // 固定高度
        background: isSelected
          ? 'linear-gradient(to bottom, rgba(var(--primary-rgb, 59, 130, 246), 0.05), white)'
          : 'white',
      }}
    >
      {/* 选择指示器 - 顶部居中 */}
      <div
        className="absolute -top-3 left-1/2 -translate-x-1/2 z-20"
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
      >
        <div
          className={`
            w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300
            backdrop-blur-md border-4
            ${
              isSelected
                ? 'bg-primary border-white shadow-lg scale-110'
                : 'bg-white/90 border-gray-200 group-hover:border-primary/50 group-hover:scale-105'
            }
          `}
        >
          {isSelected ? (
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="w-5 h-5 text-gray-400 group-hover:text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          )}
        </div>
      </div>

      {/* 预览区域 - 固定高度 */}
      <div className="relative h-[240px] rounded-t-2xl overflow-hidden bg-gradient-to-br from-gray-50 to-gray-100">
        <div className="absolute inset-0 flex items-center justify-center p-5">
          <TemplateThumbnail
            templateId={template.id}
            data={posterData}
          />
        </div>

        {/* Hover遮罩 */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

        {/* 风格标签 - 左上角 */}
        <div className="absolute top-4 left-4 z-10">
          <div className="px-4 py-2 text-xs font-bold bg-white/95 backdrop-blur-sm text-gray-900 rounded-full shadow-lg border border-gray-100">
            {styleLabel}
          </div>
        </div>

        {/* 尺寸标签 - 右上角 */}
        <div className="absolute top-4 right-4 z-10">
          <div className="px-3 py-1.5 text-xs font-semibold bg-black/70 backdrop-blur-sm text-white rounded-lg">
            {template.aspectRatio}
          </div>
        </div>
      </div>

      {/* 信息区域 - 简化设计 */}
      <div className="p-6 space-y-3">
        <div>
          <h4 className="text-xl font-bold text-foreground mb-1.5 tracking-tight">
            {template.name}
          </h4>
          <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
            {template.description}
          </p>
        </div>

        {/* 底部元信息 */}
        <div className="flex items-center justify-between pt-3 border-t border-border/50">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className="font-medium">{template.width} × {template.height}</span>
          </div>

          {isSelected && (
            <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
              <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
              <span>已选择</span>
            </div>
          )}
        </div>
      </div>

      {/* 选中底部渐变指示器 */}
      {isSelected && (
        <div
          className="absolute bottom-0 left-0 right-0 h-1.5 rounded-b-2xl"
          style={{
            background: 'linear-gradient(90deg, #f093fb 0%, #f5576c 50%, #667eea 100%)',
          }}
        />
      )}
    </div>
  );
}
