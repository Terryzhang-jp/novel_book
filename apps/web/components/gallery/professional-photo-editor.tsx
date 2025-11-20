"use client";

import { useRef, useCallback, useState, useEffect, useMemo } from "react";
import ImageEditor from "@toast-ui/react-image-editor";
import { X, Crop, Sparkles, Sliders, RotateCw, Undo, Redo, Download, Save } from "lucide-react";
import { ImageProcessor, type ImageAdjustments } from "@/lib/image-processor";
import { AdjustmentSlider } from "./adjustment-slider";
import { debounce } from "@/lib/utils/debounce";
import { saveDraft, loadDraft, clearDraft, hasDraft, getDraftAge, clearExpiredDrafts } from "@/lib/utils/draft-manager";
import { editorTheme } from "./editor-theme";
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
  const [isApplying, setIsApplying] = useState(false);

  // Draft state
  const [showDraftPrompt, setShowDraftPrompt] = useState(false);
  const [draftAge, setDraftAge] = useState<string | null>(null);

  // Adjustments state
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

  // Check for drafts
  useEffect(() => {
    if (hasDraft(photoId)) {
      const age = getDraftAge(photoId);
      setDraftAge(age);
      setShowDraftPrompt(true);
    }
    clearExpiredDrafts();
  }, [photoId]);

  // Initialize Canvas and Processor
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    const initializeCanvas = async () => {
      if (!canvasRef.current) return;

      try {
        const processor = new ImageProcessor(canvasRef.current, { useWorker: true });

        const timeoutPromise = new Promise((_, reject) => {
          timeoutId = setTimeout(() => {
            reject(new Error("Loading timeout"));
          }, 15000);
        });

        await Promise.race([
          processor.loadImage(imageUrl),
          timeoutPromise
        ]);

        clearTimeout(timeoutId);
        processorRef.current = processor;
        setLoadError(null);
      } catch (err) {
        console.error("Failed to load image:", err);
        setLoadError(err instanceof Error ? err.message : "Failed to load image");
      } finally {
        setIsProcessing(false);
      }
    };

    const timer = setTimeout(initializeCanvas, 100);

    return () => {
      clearTimeout(timer);
      if (timeoutId) clearTimeout(timeoutId);
      if (processorRef.current) {
        processorRef.current.destroy();
      }
    };
  }, [imageUrl]);

  // Debounced adjustments application
  const debouncedApplyAdjustments = useMemo(
    () =>
      debounce(async (adj: Partial<ImageAdjustments>) => {
        if (processorRef.current) {
          setIsApplying(true);
          try {
            await processorRef.current.applyAdjustmentsAsync(adj);
          } catch (error) {
            console.error("Failed to apply adjustments:", error);
          } finally {
            setIsApplying(false);
          }
        }
      }, 150),
    []
  );

  // Debounced draft saving
  const debouncedSaveDraft = useMemo(
    () =>
      debounce((adj: Partial<ImageAdjustments>) => {
        saveDraft(photoId, adj);
      }, 500),
    [photoId]
  );

  // Apply adjustments effect
  useEffect(() => {
    if (processorRef.current && activeTab === "adjust") {
      debouncedApplyAdjustments(adjustments);
      debouncedSaveDraft(adjustments);
    }
    return () => {
      debouncedApplyAdjustments.cancel();
      debouncedSaveDraft.cancel();
    };
  }, [adjustments, activeTab, debouncedApplyAdjustments, debouncedSaveDraft]);

  const updateAdjustment = useCallback((key: keyof ImageAdjustments, value: number) => {
    setAdjustments((prev) => ({ ...prev, [key]: value }));
  }, []);

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

  const handleSave = useCallback(async () => {
    if (!processorRef.current) return;

    try {
      setIsSaving(true);
      let blob: Blob;

      if (activeTab === "adjust") {
        blob = await processorRef.current.toBlob();
      } else {
        if (!editorRef.current) return;
        const editor = editorRef.current.getInstance();
        const dataURL = editor.toDataURL({ format: "jpeg", quality: 0.92 });
        const response = await fetch(dataURL);
        blob = await response.blob();
      }

      await onSave(blob);
      clearDraft(photoId);
    } catch (err) {
      console.error("Save failed:", err);
    } finally {
      setIsSaving(false);
    }
  }, [onSave, activeTab, photoId]);

  const handleRestoreDraft = useCallback(() => {
    const draft = loadDraft(photoId);
    if (draft) {
      setAdjustments(draft.adjustments);
      setShowDraftPrompt(false);
    }
  }, [photoId]);

  const handleDiscardDraft = useCallback(() => {
    clearDraft(photoId);
    setShowDraftPrompt(false);
  }, [photoId]);

  if (loadError) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#1a1a1a]">
        <div className="flex flex-col items-center gap-4 max-w-md p-6 text-center">
          <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center">
            <X className="w-8 h-8 text-red-500" />
          </div>
          <p className="text-lg text-white font-semibold">Failed to load image</p>
          <p className="text-sm text-gray-400">{loadError}</p>
          <div className="flex gap-3 mt-4">
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors"
            >
              Reload
            </button>
            <button
              onClick={onCancel}
              className="px-6 py-2.5 rounded-lg border border-gray-700 text-gray-300 text-sm font-medium hover:bg-gray-800 transition-colors"
            >
              Go Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex flex-col bg-[#09090b] text-white overflow-hidden z-50 font-sans selection:bg-white/20">
      {/* Loading Overlay */}
      {isProcessing && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#09090b]/90 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4">
            <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            <p className="text-xs text-zinc-500 font-medium tracking-wide uppercase">Loading Studio</p>
          </div>
        </div>
      )}

      {/* Header - Minimalist */}
      <div className="flex-shrink-0 h-14 border-b border-white/5 bg-[#09090b] px-6 flex items-center justify-between z-20">
        <div className="flex items-center gap-4">
          <button
            onClick={onCancel}
            className="p-2 -ml-2 rounded-full hover:bg-white/5 transition-colors text-zinc-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
          <span className="text-sm font-medium text-zinc-400">Photo Editor</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-4 py-1.5 rounded-full bg-white text-black text-xs font-semibold hover:bg-zinc-200 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {isSaving ? (
              <>
                <div className="w-3 h-3 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                Saving
              </>
            ) : (
              "Save Changes"
            )}
          </button>
        </div>
      </div>

      {/* Draft Prompt */}
      {showDraftPrompt && draftAge && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-30 bg-blue-500/10 border border-blue-500/20 backdrop-blur-md px-4 py-2 rounded-full flex items-center gap-4 shadow-2xl">
          <div className="flex items-center gap-2">
            <Sparkles className="w-3 h-3 text-blue-400" />
            <p className="text-xs text-blue-200">
              Unsaved edits from {draftAge}
            </p>
          </div>
          <div className="flex items-center gap-2 border-l border-blue-500/20 pl-4">
            <button
              onClick={handleDiscardDraft}
              className="text-[10px] font-medium text-blue-300 hover:text-white transition-colors uppercase tracking-wide"
            >
              Discard
            </button>
            <button
              onClick={handleRestoreDraft}
              className="text-[10px] font-bold text-blue-400 hover:text-white transition-colors uppercase tracking-wide"
            >
              Restore
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left Sidebar - Tools */}
        <div className="w-[320px] bg-[#09090b] border-r border-white/5 flex flex-col h-full z-10">
          {/* Tabs - Segmented Control */}
          <div className="flex-shrink-0 p-4 border-b border-white/5">
            <div className="flex p-1 bg-zinc-900/50 rounded-lg border border-white/5">
              <button
                onClick={() => setActiveTab("adjust")}
                className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all flex items-center justify-center gap-2 ${activeTab === "adjust"
                  ? "bg-zinc-800 text-white shadow-sm"
                  : "text-zinc-500 hover:text-zinc-300"
                  }`}
              >
                Adjust
              </button>
              <button
                onClick={() => setActiveTab("edit")}
                className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all flex items-center justify-center gap-2 ${activeTab === "edit"
                  ? "bg-zinc-800 text-white shadow-sm"
                  : "text-zinc-500 hover:text-zinc-300"
                  }`}
              >
                Transform
              </button>
            </div>
          </div>

          {/* Adjustments Panel */}
          {activeTab === "adjust" && (
            <div className="flex-1 overflow-y-auto min-h-0 p-6 space-y-10 custom-scrollbar">
              {/* Light */}
              <div className="space-y-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Light</h3>
                  <button
                    onClick={() => {
                      updateAdjustment("exposure", 0);
                      updateAdjustment("brightness", 0);
                      updateAdjustment("contrast", 0);
                      updateAdjustment("highlights", 0);
                      updateAdjustment("shadows", 0);
                    }}
                    className="text-[10px] text-zinc-600 hover:text-white transition-colors opacity-0 group-hover:opacity-100"
                  >
                    RESET
                  </button>
                </div>
                <div className="space-y-6">
                  <AdjustmentSlider
                    label="Exposure"
                    value={adjustments.exposure || 0}
                    onChange={(v) => updateAdjustment("exposure", v)}
                  />
                  <AdjustmentSlider
                    label="Brightness"
                    value={adjustments.brightness || 0}
                    onChange={(v) => updateAdjustment("brightness", v)}
                  />
                  <AdjustmentSlider
                    label="Contrast"
                    value={adjustments.contrast || 0}
                    onChange={(v) => updateAdjustment("contrast", v)}
                  />
                  <AdjustmentSlider
                    label="Highlights"
                    value={adjustments.highlights || 0}
                    onChange={(v) => updateAdjustment("highlights", v)}
                  />
                  <AdjustmentSlider
                    label="Shadows"
                    value={adjustments.shadows || 0}
                    onChange={(v) => updateAdjustment("shadows", v)}
                  />
                </div>
              </div>

              <div className="h-px bg-white/5" />

              {/* Color */}
              <div className="space-y-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Color</h3>
                  <button
                    onClick={() => {
                      updateAdjustment("saturation", 0);
                      updateAdjustment("vibrance", 0);
                      updateAdjustment("temperature", 0);
                      updateAdjustment("tint", 0);
                    }}
                    className="text-[10px] text-zinc-600 hover:text-white transition-colors"
                  >
                    RESET
                  </button>
                </div>
                <div className="space-y-6">
                  <AdjustmentSlider
                    label="Saturation"
                    value={adjustments.saturation || 0}
                    onChange={(v) => updateAdjustment("saturation", v)}
                  />
                  <AdjustmentSlider
                    label="Vibrance"
                    value={adjustments.vibrance || 0}
                    onChange={(v) => updateAdjustment("vibrance", v)}
                  />
                  <AdjustmentSlider
                    label="Temperature"
                    value={adjustments.temperature || 0}
                    onChange={(v) => updateAdjustment("temperature", v)}
                  />
                  <AdjustmentSlider
                    label="Tint"
                    value={adjustments.tint || 0}
                    onChange={(v) => updateAdjustment("tint", v)}
                  />
                </div>
              </div>

              <div className="h-px bg-white/5" />

              {/* Detail */}
              <div className="space-y-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Detail</h3>
                  <button
                    onClick={() => {
                      updateAdjustment("clarity", 0);
                      updateAdjustment("sharpness", 0);
                    }}
                    className="text-[10px] text-zinc-600 hover:text-white transition-colors"
                  >
                    RESET
                  </button>
                </div>
                <div className="space-y-6">
                  <AdjustmentSlider
                    label="Clarity"
                    value={adjustments.clarity || 0}
                    onChange={(v) => updateAdjustment("clarity", v)}
                  />
                  <AdjustmentSlider
                    label="Sharpness"
                    value={adjustments.sharpness || 0}
                    onChange={(v) => updateAdjustment("sharpness", v)}
                    min={0}
                    max={100}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Edit Panel Placeholder */}
          {activeTab === "edit" && (
            <div className="flex-1 flex flex-col items-center justify-center text-zinc-500 p-8 text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-zinc-900 flex items-center justify-center">
                <Crop className="w-5 h-5 text-zinc-600" />
              </div>
              <p className="text-xs leading-relaxed max-w-[200px]">
                Use the toolbar overlay on the image to crop, rotate, and apply filters.
              </p>
            </div>
          )}
        </div>

        {/* Main Canvas Area */}
        <div className="flex-1 bg-[#000000] relative overflow-hidden flex items-center justify-center min-w-0">
          {/* Adjust Mode Canvas */}
          <div
            className="relative w-full h-full flex items-center justify-center p-12"
            style={{
              visibility: activeTab === "adjust" ? "visible" : "hidden",
              pointerEvents: activeTab === "adjust" ? "auto" : "none",
            }}
          >
            <canvas
              ref={canvasRef}
              className="max-w-full max-h-full object-contain shadow-2xl shadow-black/50"
            />
          </div>

          {/* Edit Mode Editor */}
          <div
            className="absolute inset-0"
            style={{
              opacity: activeTab === "edit" ? 1 : 0,
              pointerEvents: activeTab === "edit" ? "auto" : "none",
              zIndex: activeTab === "edit" ? 10 : -1,
            }}
          >
            <ImageEditor
              ref={editorRef}
              includeUI={{
                loadImage: {
                  path: imageUrl,
                  name: "Photo",
                },
                menu: ["crop", "flip", "rotate", "filter", "draw", "shape", "text"],
                initMenu: "crop",
                uiSize: {
                  height: "100%",
                  width: "100%",
                },
                menuBarPosition: "left",
                theme: editorTheme,
              }}
              cssMaxHeight={window.innerHeight - 80}
              usageStatistics={false}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
