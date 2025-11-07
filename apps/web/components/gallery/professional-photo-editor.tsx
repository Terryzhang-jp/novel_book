"use client";

import { useRef, useCallback, useState, useEffect, useMemo } from "react";
import ImageEditor from "@toast-ui/react-image-editor";
import { X, Crop, Sparkles, Sliders, RotateCw } from "lucide-react";
import { ImageProcessor, type ImageAdjustments } from "@/lib/image-processor";
import { AdjustmentSlider } from "./adjustment-slider";
import { debounce } from "@/lib/utils/debounce";
import { saveDraft, loadDraft, clearDraft, hasDraft, getDraftAge, clearExpiredDrafts } from "@/lib/utils/draft-manager";
import "tui-image-editor/dist/tui-image-editor.css";
import "@/styles/clean-editor.css";

interface PhotoEditorProps {
  photoId: string;
  imageUrl: string;
  onSave: (blob: Blob) => Promise<void>;
  onCancel: () => void;
}

type TabType = "adjust" | "edit";

export function ProfessionalPhotoEditor({ photoId, imageUrl, onSave, onCancel }: PhotoEditorProps) {
  const editorRef = useRef<any>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const processorRef = useRef<ImageProcessor | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [isProcessing, setIsProcessing] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>("adjust");
  const [isApplying, setIsApplying] = useState(false); // 图像处理中状态

  // 草稿恢复状态
  const [showDraftPrompt, setShowDraftPrompt] = useState(false);
  const [draftAge, setDraftAge] = useState<string | null>(null);

  // 调整参数
  const [adjustments, setAdjustments] = useState<Partial<ImageAdjustments>>({
    brightness: 0,
    contrast: 0,
    exposure: 0,
    highlights: 0,
    shadows: 0,
    saturation: 0,
    temperature: 0,
    tint: 0,
    vibrance: 0,
    clarity: 0,
    sharpness: 0,
  });

  // 检测草稿
  useEffect(() => {
    if (hasDraft(photoId)) {
      const age = getDraftAge(photoId);
      setDraftAge(age);
      setShowDraftPrompt(true);
      console.log(`[ProfessionalPhotoEditor] Draft detected for photo ${photoId}, age: ${age}`);
    }

    // 清理过期草稿
    clearExpiredDrafts();
  }, [photoId]);

  // 初始化Canvas和加载图片
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    const initializeCanvas = async () => {
      if (!canvasRef.current) {
        console.log("Canvas ref not ready, will retry");
        return;
      }

      console.log("Initializing canvas with image:", imageUrl);

      try {
        // 启用Web Worker进行图像处理
        const processor = new ImageProcessor(canvasRef.current, { useWorker: true });

        // 设置15秒超时
        const timeoutPromise = new Promise((_, reject) => {
          timeoutId = setTimeout(() => {
            reject(new Error("加载超时 - 图片太大或网络太慢"));
          }, 15000);
        });

        // 竞争：图片加载 vs 超时
        await Promise.race([
          processor.loadImage(imageUrl),
          timeoutPromise
        ]);

        clearTimeout(timeoutId);
        processorRef.current = processor;
        console.log("Canvas initialized successfully");
        setLoadError(null);
      } catch (err) {
        console.error("图片加载失败:", err);
        const errorMsg = err instanceof Error ? err.message : "图片加载失败";
        setLoadError(errorMsg);
      } finally {
        setIsProcessing(false);
      }
    };

    // 确保在下一个渲染周期执行，这时canvas已经就绪
    const timer = setTimeout(() => {
      initializeCanvas();
    }, 100);

    return () => {
      clearTimeout(timer);
      if (timeoutId) clearTimeout(timeoutId);
      // 清理Worker资源
      if (processorRef.current) {
        processorRef.current.destroy();
      }
    };
  }, [imageUrl]);

  // 创建防抖版本的applyAdjustments - 使用useMemo确保函数稳定
  const debouncedApplyAdjustments = useMemo(
    () =>
      debounce(async (adj: Partial<ImageAdjustments>) => {
        if (processorRef.current) {
          console.log("Applying adjustments (debounced):", adj);
          setIsApplying(true);

          try {
            // 使用异步Worker处理（如果可用）
            await processorRef.current.applyAdjustmentsAsync(adj);
          } catch (error) {
            console.error("Failed to apply adjustments:", error);
          } finally {
            setIsApplying(false);
          }
        }
      }, 150), // 150ms防抖延迟 - 在用户停止拖动150ms后执行
    []
  );

  // 创建防抖版本的草稿保存 - 避免频繁写localStorage
  const debouncedSaveDraft = useMemo(
    () =>
      debounce((adj: Partial<ImageAdjustments>) => {
        saveDraft(photoId, adj);
      }, 500), // 500ms防抖 - 比图像处理稍长
    [photoId]
  );

  // 应用调整 - 使用防抖避免频繁计算
  useEffect(() => {
    if (processorRef.current && activeTab === "adjust") {
      // 当切换回调整模式时，立即应用（不防抖）
      console.log("Applying adjustments in adjust mode");
      debouncedApplyAdjustments(adjustments);

      // 同时保存草稿（防抖）
      debouncedSaveDraft(adjustments);
    }

    // 清理函数：组件卸载或adjustments变化时取消pending的防抖
    return () => {
      debouncedApplyAdjustments.cancel();
      debouncedSaveDraft.cancel();
    };
  }, [adjustments, activeTab, debouncedApplyAdjustments, debouncedSaveDraft]);

  // 更新调整参数
  const updateAdjustment = useCallback((key: keyof ImageAdjustments, value: number) => {
    setAdjustments((prev) => ({ ...prev, [key]: value }));
  }, []);

  // 重置所有调整
  const resetAdjustments = useCallback(() => {
    setAdjustments({
      brightness: 0,
      contrast: 0,
      exposure: 0,
      highlights: 0,
      shadows: 0,
      saturation: 0,
      temperature: 0,
      tint: 0,
      vibrance: 0,
      clarity: 0,
      sharpness: 0,
    });
  }, []);

  // 保存
  const handleSave = useCallback(async () => {
    if (!processorRef.current) return;

    try {
      setIsSaving(true);

      let blob: Blob;

      if (activeTab === "adjust") {
        // 保存调整后的图片
        blob = await processorRef.current.toBlob();
      } else {
        // 保存编辑器的图片
        if (!editorRef.current) return;
        const editor = editorRef.current.getInstance();
        const dataURL = editor.toDataURL({ format: "jpeg", quality: 0.92 });
        const response = await fetch(dataURL);
        blob = await response.blob();
      }

      await onSave(blob);

      // 保存成功后清除草稿
      clearDraft(photoId);
      console.log(`[ProfessionalPhotoEditor] Draft cleared after successful save`);
    } catch (err) {
      console.error("保存失败:", err);
    } finally {
      setIsSaving(false);
    }
  }, [onSave, activeTab, photoId]);

  // 恢复草稿
  const handleRestoreDraft = useCallback(() => {
    const draft = loadDraft(photoId);
    if (draft) {
      setAdjustments(draft.adjustments);
      setShowDraftPrompt(false);
      console.log(`[ProfessionalPhotoEditor] Draft restored`, draft.adjustments);
    }
  }, [photoId]);

  // 丢弃草稿
  const handleDiscardDraft = useCallback(() => {
    clearDraft(photoId);
    setShowDraftPrompt(false);
    console.log(`[ProfessionalPhotoEditor] Draft discarded`);
  }, [photoId]);

  // 错误状态
  if (loadError) {
    return (
      <div className="flex items-center justify-center h-screen bg-white">
        <div className="flex flex-col items-center gap-4 max-w-md p-6">
          <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
            <X className="w-8 h-8 text-red-600" />
          </div>
          <p className="text-lg text-gray-900 font-semibold">加载失败</p>
          <p className="text-sm text-gray-600 text-center">{loadError}</p>
          <div className="flex gap-3 mt-4">
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors"
            >
              重新加载
            </button>
            <button
              onClick={onCancel}
              className="px-6 py-2.5 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              返回
            </button>
          </div>
          <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-xs text-yellow-800">
              <strong>提示：</strong>如果问题持续存在，可能是：
            </p>
            <ul className="text-xs text-yellow-700 mt-2 space-y-1 list-disc list-inside">
              <li>图片文件过大（建议小于10MB）</li>
              <li>网络连接不稳定</li>
              <li>浏览器不支持Canvas功能</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-white relative">
      {/* Loading overlay - 覆盖整个屏幕 */}
      {isProcessing && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-white">
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-base text-gray-900 font-semibold">正在加载图片...</p>
            <p className="text-sm text-gray-500">请稍候，正在准备编辑器</p>
            <p className="text-xs text-gray-400 mt-2">如果加载时间过长，请检查网络连接</p>
          </div>
        </div>
      )}

      {/* 主要内容 - loading时隐藏 */}
      <div className={`flex flex-col h-full ${isProcessing ? 'invisible' : 'visible'}`}>
      {/* 顶部工具栏 */}
      <div className="flex-shrink-0 bg-white border-b border-gray-200 px-6 py-3">
        <div className="flex items-center justify-between">
          {/* 左侧 - 关闭和标题 */}
          <div className="flex items-center gap-3">
            <button
              onClick={onCancel}
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
              aria-label="关闭"
            >
              <X className="w-5 h-5 text-gray-700" strokeWidth={2} />
            </button>
            <h1 className="text-lg font-semibold text-gray-900">编辑照片</h1>
          </div>

          {/* 右侧 - 操作按钮 */}
          <div className="flex items-center gap-2">
            <button
              onClick={onCancel}
              disabled={isSaving}
              className="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors disabled:opacity-50"
            >
              取消
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-5 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 shadow-sm"
            >
              {isSaving ? (
                <span className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  保存中
                </span>
              ) : (
                "完成"
              )}
            </button>
          </div>
        </div>
      </div>

      {/* 草稿恢复提示 */}
      {showDraftPrompt && draftAge && (
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-3">
          <div className="flex items-center justify-between max-w-4xl mx-auto">
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0 w-8 h-8 bg-amber-100 rounded-full flex items-center justify-center">
                <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-amber-900">
                  检测到未保存的编辑
                </p>
                <p className="text-xs text-amber-700 mt-0.5">
                  您在{draftAge}有未保存的调整，是否恢复？
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleDiscardDraft}
                className="px-3 py-1.5 text-xs font-medium text-amber-700 hover:text-amber-800 hover:bg-amber-100 rounded transition-colors"
              >
                丢弃
              </button>
              <button
                onClick={handleRestoreDraft}
                className="px-3 py-1.5 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded shadow-sm transition-colors"
              >
                恢复编辑
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* 左侧 - 调整面板（仅在调整模式显示） */}
        {activeTab === "adjust" && (
          <div className="w-80 bg-gray-50 border-r border-gray-200 flex flex-col overflow-hidden">
            {/* 标签页 */}
            <div className="flex border-b border-gray-200 bg-white">
              <button
                onClick={() => setActiveTab("adjust")}
                className="flex-1 px-4 py-3 text-sm font-semibold transition-colors flex items-center justify-center gap-2 text-blue-600 border-b-2 border-blue-600 bg-blue-50/50"
              >
                <Sliders className="w-4 h-4" />
                调整
              </button>
              <button
                onClick={() => setActiveTab("edit")}
                className="flex-1 px-4 py-3 text-sm font-semibold transition-colors flex items-center justify-center gap-2 text-gray-600 hover:text-gray-900 hover:bg-gray-50"
              >
                <Crop className="w-4 h-4" />
                编辑
              </button>
            </div>

            {/* 调整面板内容 */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* 光线调整 */}
              <div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  光线
                </h3>
                <div className="space-y-4">
                  <AdjustmentSlider
                    label="曝光"
                    value={adjustments.exposure || 0}
                    onChange={(v) => updateAdjustment("exposure", v)}
                  />
                  <AdjustmentSlider
                    label="亮度"
                    value={adjustments.brightness || 0}
                    onChange={(v) => updateAdjustment("brightness", v)}
                  />
                  <AdjustmentSlider
                    label="对比度"
                    value={adjustments.contrast || 0}
                    onChange={(v) => updateAdjustment("contrast", v)}
                  />
                  <AdjustmentSlider
                    label="高光"
                    value={adjustments.highlights || 0}
                    onChange={(v) => updateAdjustment("highlights", v)}
                  />
                  <AdjustmentSlider
                    label="阴影"
                    value={adjustments.shadows || 0}
                    onChange={(v) => updateAdjustment("shadows", v)}
                  />
                </div>
              </div>

              {/* 颜色调整 */}
              <div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  颜色
                </h3>
                <div className="space-y-4">
                  <AdjustmentSlider
                    label="饱和度"
                    value={adjustments.saturation || 0}
                    onChange={(v) => updateAdjustment("saturation", v)}
                  />
                  <AdjustmentSlider
                    label="自然饱和度"
                    value={adjustments.vibrance || 0}
                    onChange={(v) => updateAdjustment("vibrance", v)}
                  />
                  <AdjustmentSlider
                    label="色温"
                    value={adjustments.temperature || 0}
                    onChange={(v) => updateAdjustment("temperature", v)}
                  />
                  <AdjustmentSlider
                    label="色调"
                    value={adjustments.tint || 0}
                    onChange={(v) => updateAdjustment("tint", v)}
                  />
                </div>
              </div>

              {/* 细节调整 */}
              <div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  细节
                </h3>
                <div className="space-y-4">
                  <AdjustmentSlider
                    label="清晰度"
                    value={adjustments.clarity || 0}
                    onChange={(v) => updateAdjustment("clarity", v)}
                  />
                  <AdjustmentSlider
                    label="锐化"
                    value={adjustments.sharpness || 0}
                    onChange={(v) => updateAdjustment("sharpness", v)}
                    min={0}
                    max={100}
                  />
                </div>
              </div>

              {/* 重置按钮 */}
              <button
                onClick={resetAdjustments}
                className="w-full py-2.5 rounded-lg bg-gray-200 text-gray-700 hover:bg-gray-300 transition-colors font-medium text-sm"
              >
                重置所有调整
              </button>
            </div>
          </div>
        )}

        {/* 编辑模式的标签切换浮动按钮 */}
        {activeTab === "edit" && (
          <div className="absolute top-4 left-4 z-10 bg-white rounded-lg shadow-lg border border-gray-200">
            <div className="flex">
              <button
                onClick={() => setActiveTab("adjust")}
                className="px-4 py-2.5 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-l-lg transition-colors flex items-center gap-2"
              >
                <Sliders className="w-4 h-4" />
                调整
              </button>
              <button
                className="px-4 py-2.5 text-sm font-semibold text-blue-600 bg-blue-50 rounded-r-lg flex items-center gap-2 border-l border-gray-200 cursor-default"
              >
                <Crop className="w-4 h-4" />
                编辑
              </button>
            </div>
          </div>
        )}

        {/* 右侧 - 图片预览/编辑器 */}
        <div className="flex-1 bg-gray-100 relative overflow-hidden">
          {/* 调整模式 - Canvas（始终保持在DOM中，用CSS控制显示） */}
          <div
            className="absolute inset-0 flex items-center justify-center p-6"
            style={{
              visibility: activeTab === "adjust" ? "visible" : "hidden",
              pointerEvents: activeTab === "adjust" ? "auto" : "none",
            }}
          >
            <canvas
              ref={canvasRef}
              className="max-w-full max-h-full object-contain shadow-2xl rounded-lg"
            />
          </div>

          {/* 编辑模式 - TOAST UI（始终在DOM中，用visibility控制） */}
          <div
            className="h-full w-full"
            style={{
              visibility: activeTab === "edit" ? "visible" : "hidden",
              pointerEvents: activeTab === "edit" ? "auto" : "none",
            }}
          >
            <ImageEditor
              ref={editorRef}
              includeUI={{
                loadImage: {
                  path: imageUrl,
                  name: "照片",
                },
                menu: ["crop", "flip", "rotate", "filter", "draw", "shape", "text"],
                initMenu: "crop",
                uiSize: {
                  height: "calc(100vh - 65px)",
                  width: "100%",
                },
                menuBarPosition: "left",
                theme: {
                  "common.backgroundColor": "#f3f4f6",
                  "menu.normalIcon.color": "#6b7280",
                  "menu.activeIcon.color": "#2563eb",
                  "submenu.backgroundColor": "#ffffff",
                },
              }}
              cssMaxHeight={window.innerHeight - 65}
              usageStatistics={false}
            />
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
