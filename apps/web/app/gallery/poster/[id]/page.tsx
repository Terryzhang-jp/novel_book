'use client';

import { use, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Download, ArrowLeft, Grid3x3, Layers } from 'lucide-react';
import type { Photo, Location } from '@/types/storage';
import type { PosterData, TemplateId } from '@/lib/poster/types';
import { PosterGenerator } from '@/components/poster/poster-generator';
import { TemplatePreviewGrid } from '@/components/poster/template-preview-grid';
import { TemplateSwipeView } from '@/components/poster/template-swipe-view';
import { jsonContentToText } from '@/lib/poster/json-content-to-text';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function PosterGeneratorPage({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();

  const [photo, setPhoto] = useState<Photo | null>(null);
  const [location, setLocation] = useState<Location | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedTemplates, setSelectedTemplates] = useState<TemplateId[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingTemplate, setGeneratingTemplate] = useState<TemplateId | null>(null);
  const [viewMode, setViewMode] = useState<'swipe' | 'grid'>('swipe');

  // Load photo and location data
  useEffect(() => {
    const loadData = async () => {
      try {
        // Fetch photo
        const photoResponse = await fetch(`/api/photos/${id}`);
        if (!photoResponse.ok) {
          throw new Error('Failed to load photo');
        }
        const photoData = await photoResponse.json();
        const photoObj = photoData.photo || photoData;
        setPhoto(photoObj);

        // Fetch location if linked
        if (photoObj.locationId) {
          try {
            const locationResponse = await fetch(`/api/locations/${photoObj.locationId}`);
            if (locationResponse.ok) {
              const locationData = await locationResponse.json();
              setLocation(locationData.location || locationData);
            }
          } catch (err) {
            console.error('Failed to load location:', err);
            // Continue without location data
          }
        }
      } catch (err) {
        console.error('Failed to load data:', err);
        setError('无法加载照片数据');
      } finally {
        setIsLoading(false);
      }
    };

    if (id) {
      loadData();
    }
  }, [id]);

  // Prepare poster data
  const posterData: PosterData | null = photo
    ? {
        photoUrl: photo.fileUrl,
        title: photo.title,
        description: jsonContentToText(photo.description),
        location: location?.name,
        date: photo.metadata.dateTime
          ? new Date(photo.metadata.dateTime).toLocaleDateString('zh-CN', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })
          : undefined,
        camera:
          photo.metadata.camera?.make && photo.metadata.camera?.model
            ? `${photo.metadata.camera.make} ${photo.metadata.camera.model}`
            : undefined,
        coordinates: photo.metadata.location
          ? {
              latitude: photo.metadata.location.latitude,
              longitude: photo.metadata.location.longitude,
            }
          : undefined,
      }
    : null;

  const handleDownloadSelected = async () => {
    if (selectedTemplates.length === 0) {
      alert('请至少选择一个模板');
      return;
    }

    setIsGenerating(true);
    try {
      // Import download functions
      const { downloadFile, downloadAsZip, generateFilename } = await import(
        '@/lib/poster/batch-download'
      );
      const { elementToBlob } = await import('@/lib/poster/html-to-image');

      const files: Array<{ blob: Blob; filename: string }> = [];

      for (const templateId of selectedTemplates) {
        try {
          setGeneratingTemplate(templateId);

          const elementId = `${templateId}-template`;
          const element = document.getElementById(elementId);

          if (!element) {
            console.error(`Template element not found: ${elementId}`);
            continue;
          }

          const blob = await elementToBlob(element as HTMLElement, {
            format: 'png',
            scale: 2,
          });

          files.push({
            blob,
            filename: generateFilename(templateId, photo?.title),
          });
        } catch (error) {
          console.error(`Failed to generate ${templateId}:`, error);
        }
      }

      setGeneratingTemplate(null);

      if (files.length === 0) {
        throw new Error('未能生成任何海报');
      }

      // Download
      if (files.length === 1) {
        await downloadFile(files[0].blob, files[0].filename);
      } else {
        const zipName = photo?.title ? `${photo.title}-posters.zip` : 'posters.zip';
        await downloadAsZip(files, zipName);
      }
    } catch (err) {
      console.error('Download failed:', err);
      alert('下载失败，请重试');
    } finally {
      setIsGenerating(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">加载照片数据...</p>
        </div>
      </div>
    );
  }

  if (error || !photo || !posterData) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="flex flex-col items-center gap-4">
          <p className="text-red-600">{error || '照片不存在'}</p>
          <button
            onClick={() => router.back()}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            返回
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      {/* Header - 改进设计 */}
      <header className="border-b border-border/40 bg-background/80 backdrop-blur-lg sticky top-0 z-50 shadow-sm">
        <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-5">
              <button
                onClick={() => router.back()}
                className="p-2.5 rounded-xl hover:bg-secondary transition-all hover:scale-105 active:scale-95"
                disabled={isGenerating}
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <h1 className="text-2xl font-bold text-foreground tracking-tight">生成海报</h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {photo.title || '未命名照片'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* 视图切换按钮 */}
              <div className="flex items-center gap-1 p-1 bg-secondary/50 rounded-xl">
                <button
                  onClick={() => setViewMode('swipe')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    viewMode === 'swipe'
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Layers className="w-4 h-4" />
                  <span>滑动</span>
                </button>
                <button
                  onClick={() => setViewMode('grid')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    viewMode === 'grid'
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Grid3x3 className="w-4 h-4" />
                  <span>网格</span>
                </button>
              </div>

              {/* 下载按钮 - 仅在网格模式显示 */}
              {viewMode === 'grid' && (
                <button
                  onClick={handleDownloadSelected}
                  disabled={isGenerating || selectedTemplates.length === 0}
                  className="flex items-center gap-3 px-7 py-3.5 rounded-xl bg-gradient-to-r from-primary to-primary/90 text-primary-foreground hover:shadow-lg hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 transition-all font-semibold shadow-md"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>生成中...</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-5 h-5" />
                      <span>
                        下载选中 ({selectedTemplates.length})
                      </span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>

          {/* Generating status - 改进设计 */}
          {isGenerating && generatingTemplate && (
            <div className="mt-4 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20 rounded-xl border border-blue-200/50 dark:border-blue-800/50 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                  正在生成: <span className="font-bold">{generatingTemplate}</span>
                </p>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Main content */}
      <main className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {/* Photo preview - 改进设计 */}
        <div className="mb-10 bg-gradient-to-br from-card to-card/50 rounded-2xl border border-border/50 overflow-hidden shadow-xl">
          <div className="aspect-video relative bg-gradient-to-br from-muted/50 to-muted">
            <img
              src={photo.fileUrl}
              alt={photo.title || '照片'}
              className="w-full h-full object-contain"
            />
            {/* 照片装饰遮罩 */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent" />
          </div>
          <div className="p-8 bg-card/80 backdrop-blur-sm">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-sm">
              {posterData.title && (
                <div className="space-y-2">
                  <div className="text-muted-foreground text-xs font-medium uppercase tracking-wide">标题</div>
                  <div className="font-semibold text-foreground text-base">{posterData.title}</div>
                </div>
              )}
              {posterData.location && (
                <div className="space-y-2">
                  <div className="text-muted-foreground text-xs font-medium uppercase tracking-wide">地点</div>
                  <div className="font-semibold text-foreground text-base">{posterData.location}</div>
                </div>
              )}
              {posterData.date && (
                <div className="space-y-2">
                  <div className="text-muted-foreground text-xs font-medium uppercase tracking-wide">日期</div>
                  <div className="font-semibold text-foreground text-base">{posterData.date}</div>
                </div>
              )}
              {posterData.camera && (
                <div className="space-y-2">
                  <div className="text-muted-foreground text-xs font-medium uppercase tracking-wide">相机</div>
                  <div className="font-semibold text-foreground text-base">{posterData.camera}</div>
                </div>
              )}
            </div>
            {posterData.description && (
              <div className="mt-6 pt-6 border-t border-border/50">
                <div className="text-muted-foreground text-xs font-medium uppercase tracking-wide mb-3">描述</div>
                <p className="text-foreground text-base leading-relaxed line-clamp-3 font-light">
                  {posterData.description}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* 视图切换 */}
        {viewMode === 'swipe' ? (
          <TemplateSwipeView
            posterData={posterData}
            onTemplateClick={(templateId) => {
              // TODO: 进入编辑页面
              console.log('点击编辑模板:', templateId);
              alert(`即将进入 ${templateId} 模板的编辑页面\n\n（编辑功能开发中...）`);
            }}
          />
        ) : (
          <TemplatePreviewGrid
            selectedTemplates={selectedTemplates}
            onSelectionChange={setSelectedTemplates}
            onTemplateClick={(templateId) => {
              // Toggle selection on click
              if (selectedTemplates.includes(templateId)) {
                setSelectedTemplates(selectedTemplates.filter((id) => id !== templateId));
              } else {
                setSelectedTemplates([...selectedTemplates, templateId]);
              }
            }}
            posterData={posterData}
          />
        )}
      </main>

      {/* Hidden poster generator */}
      <PosterGenerator
        data={posterData}
        onGenerating={(templateId) => setGeneratingTemplate(templateId)}
        onComplete={() => setGeneratingTemplate(null)}
        onError={(templateId, error) => {
          console.error(`Error generating ${templateId}:`, error);
          setGeneratingTemplate(null);
        }}
      />
    </div>
  );
}
