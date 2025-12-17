/**
 * AI Magic Sidebar
 *
 * 右侧可折叠侧边栏，用于 AI 图像生成
 * 流程：输入 -> 优化 Prompt -> 生成图像 -> 结果
 */

"use client";

import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  ChevronLeft,
  ChevronRight,
  X,
  Upload,
  Image as ImageIcon,
  Palette,
  ArrowRight,
  Loader2,
  Check,
  RotateCcw,
  History,
  Trash2,
  Lightbulb,
  Edit3,
  Wand2,
  Plus,
} from "lucide-react";
import { useAiMagicStore } from "@/lib/canvas/ai-magic-store";

interface AiMagicSidebarProps {
  onInsertImage?: (imageDataUrl: string) => void;
}

export function AiMagicSidebar({ onInsertImage }: AiMagicSidebarProps) {
  const {
    isOpen,
    step,
    userPrompt,
    inputImages,
    styleImages,
    optimizedPrompt,
    reasoning,
    suggestions,
    resultImage,
    isOptimizing,
    isGenerating,
    error,
    history,
    isLoadingHistory,
    // Actions
    closeSidebar,
    setUserPrompt,
    addInputImage,
    removeInputImage,
    addStyleImage,
    removeStyleImage,
    setOptimizedPrompt,
    optimize,
    generate,
    goBack,
    reset,
    clearError,
    loadHistory,
    deleteHistoryItem,
    useHistoryItem,
  } = useAiMagicStore();

  const inputImageRef = useRef<HTMLInputElement>(null);
  const styleImageRef = useRef<HTMLInputElement>(null);

  // 加载历史记录
  useEffect(() => {
    if (isOpen) {
      loadHistory();
    }
  }, [isOpen, loadHistory]);

  // 支持的图片格式
  const SUPPORTED_FORMATS = ["image/png", "image/jpeg", "image/jpg", "image/webp"];

  // 处理图片上传
  const handleImageUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    type: "input" | "style"
  ) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach((file) => {
      // 检查文件格式
      if (!SUPPORTED_FORMATS.includes(file.type)) {
        alert(`不支持的格式: ${file.type}\n请使用 PNG, JPEG 或 WebP 格式`);
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        if (type === "input") {
          addInputImage(dataUrl);
        } else {
          addStyleImage(dataUrl);
        }
      };
      reader.readAsDataURL(file);
    });

    // 重置 input
    e.target.value = "";
  };

  // 插入到 Canvas
  const handleInsertToCanvas = () => {
    if (resultImage && onInsertImage) {
      onInsertImage(resultImage);
      reset();
    }
  };

  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%" }}
      transition={{ type: "spring", damping: 25, stiffness: 200 }}
      className="fixed right-0 top-0 bottom-0 w-[380px] z-50 flex flex-col"
      style={{
        background: "rgba(255, 255, 255, 0.75)",
        backdropFilter: "blur(20px) saturate(180%)",
        WebkitBackdropFilter: "blur(20px) saturate(180%)",
        borderLeft: "1px solid rgba(255, 255, 255, 0.3)",
        boxShadow: "0 8px 32px rgba(0, 0, 0, 0.12)",
      }}
    >
      {/* Header - Frosted Glass */}
      <div
        className="flex items-center justify-between px-5 py-4"
        style={{
          background: "rgba(255, 255, 255, 0.5)",
          borderBottom: "1px solid rgba(0, 0, 0, 0.06)",
        }}
      >
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-violet-500 to-purple-600 rounded-xl text-white shadow-lg shadow-purple-500/25">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-800 text-sm">AI Magic</h2>
            <p className="text-[10px] text-gray-500">Powered by Gemini</p>
          </div>
        </div>
        <button
          onClick={closeSidebar}
          className="p-2 hover:bg-black/5 rounded-lg transition-colors"
        >
          <X className="w-4 h-4 text-gray-400" />
        </button>
      </div>

      {/* Hidden file inputs - 只支持 PNG, JPEG, WebP (不支持 GIF) */}
      <input
        ref={inputImageRef}
        type="file"
        accept="image/png,image/jpeg,image/jpg,image/webp"
        multiple
        onChange={(e) => handleImageUpload(e, "input")}
        className="hidden"
      />
      <input
        ref={styleImageRef}
        type="file"
        accept="image/png,image/jpeg,image/jpg,image/webp"
        multiple
        onChange={(e) => handleImageUpload(e, "style")}
        className="hidden"
      />

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          {/* Step 1: Input */}
          {step === "input" && (
            <motion.div
              key="input"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="p-4 space-y-4"
            >
              {/* User Prompt */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">
                  Describe what you want to create
                </label>
                <textarea
                  value={userPrompt}
                  onChange={(e) => setUserPrompt(e.target.value)}
                  placeholder="e.g., A person standing on a beach during sunset with warm golden light..."
                  className="w-full h-28 p-3 bg-white/60 border border-gray-200/60 rounded-xl focus:ring-2 focus:ring-purple-500/50 focus:border-purple-300 focus:bg-white/80 resize-none text-sm placeholder:text-gray-400 transition-all"
                />
              </div>

              {/* Input Images */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-gray-600 flex items-center gap-2">
                    <ImageIcon className="w-3.5 h-3.5" />
                    Input Images
                    <span className="text-gray-400 font-normal text-[10px]">
                      (optional, max 6)
                    </span>
                  </label>
                </div>
                <div className="flex flex-wrap gap-2">
                  {inputImages.map((img, index) => (
                    <div
                      key={index}
                      className="relative w-16 h-16 rounded-lg overflow-hidden group"
                    >
                      <img
                        src={img}
                        alt={`Input ${index + 1}`}
                        className="w-full h-full object-cover"
                      />
                      <button
                        onClick={() => removeInputImage(index)}
                        className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                      >
                        <X className="w-4 h-4 text-white" />
                      </button>
                    </div>
                  ))}
                  {inputImages.length < 6 && (
                    <button
                      onClick={() => inputImageRef.current?.click()}
                      className="w-16 h-16 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center hover:border-indigo-500 hover:bg-indigo-50 transition-colors"
                    >
                      <Plus className="w-5 h-5 text-gray-400" />
                    </button>
                  )}
                </div>
              </div>

              {/* Style Reference Images */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                    <Palette className="w-4 h-4" />
                    Style Reference
                    <span className="text-gray-400 font-normal">
                      (optional, max 5)
                    </span>
                  </label>
                </div>
                <div className="flex flex-wrap gap-2">
                  {styleImages.map((img, index) => (
                    <div
                      key={index}
                      className="relative w-16 h-16 rounded-lg overflow-hidden group"
                    >
                      <img
                        src={img}
                        alt={`Style ${index + 1}`}
                        className="w-full h-full object-cover"
                      />
                      <button
                        onClick={() => removeStyleImage(index)}
                        className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                      >
                        <X className="w-4 h-4 text-white" />
                      </button>
                    </div>
                  ))}
                  {styleImages.length < 5 && (
                    <button
                      onClick={() => styleImageRef.current?.click()}
                      className="w-16 h-16 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center hover:border-purple-500 hover:bg-purple-50 transition-colors"
                    >
                      <Plus className="w-5 h-5 text-gray-400" />
                    </button>
                  )}
                </div>
              </div>

              {/* Optimize Button */}
              <button
                onClick={optimize}
                disabled={!userPrompt.trim() || isOptimizing}
                className="w-full py-2.5 bg-gradient-to-r from-violet-500 to-purple-600 text-white text-sm font-medium rounded-xl hover:from-violet-600 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 shadow-lg shadow-purple-500/20"
              >
                {isOptimizing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Optimizing...
                  </>
                ) : (
                  <>
                    <Wand2 className="w-4 h-4" />
                    Optimize Prompt
                  </>
                )}
              </button>

              {/* History Section */}
              {history.length > 0 && (
                <div className="pt-4 border-t border-gray-200">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-medium text-gray-700 flex items-center gap-2">
                      <History className="w-4 h-4" />
                      Recent Generations
                    </h3>
                  </div>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {history.slice(0, 5).map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors group"
                      >
                        <button
                          onClick={() => useHistoryItem(item)}
                          className="flex-1 text-left"
                        >
                          <p className="text-sm text-gray-700 truncate">
                            {item.userPrompt}
                          </p>
                          <p className="text-xs text-gray-400">
                            {new Date(item.createdAt).toLocaleDateString()}
                          </p>
                        </button>
                        <button
                          onClick={() => deleteHistoryItem(item.id)}
                          className="p-1 opacity-0 group-hover:opacity-100 hover:bg-red-100 rounded transition-all"
                        >
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* Step 2: Optimize */}
          {step === "optimize" && (
            <motion.div
              key="optimize"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="p-4 space-y-4"
            >
              {/* Back Button */}
              <button
                onClick={goBack}
                className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
              >
                <ChevronLeft className="w-4 h-4" />
                Back to input
              </button>

              {/* Reasoning */}
              {reasoning && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
                  <div className="flex items-start gap-2">
                    <Lightbulb className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-sm font-medium text-amber-800 mb-1">
                        AI Reasoning
                      </h4>
                      <p className="text-sm text-amber-700">{reasoning}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Optimized Prompt (Editable) */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                    <Edit3 className="w-4 h-4" />
                    Optimized Prompt
                  </label>
                </div>
                <textarea
                  value={optimizedPrompt}
                  onChange={(e) => setOptimizedPrompt(e.target.value)}
                  className="w-full h-40 p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none text-sm font-mono"
                />
              </div>

              {/* Suggestions */}
              {suggestions.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-2">
                    Suggestions
                  </h4>
                  <ul className="space-y-1">
                    {suggestions.map((suggestion, index) => (
                      <li
                        key={index}
                        className="text-sm text-gray-600 flex items-start gap-2"
                      >
                        <span className="text-indigo-500">•</span>
                        {suggestion}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Generate Button */}
              <button
                onClick={generate}
                disabled={!optimizedPrompt.trim() || isGenerating}
                className="w-full py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white font-medium rounded-xl hover:from-green-700 hover:to-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5" />
                    Generate Image
                  </>
                )}
              </button>
            </motion.div>
          )}

          {/* Step 3: Generating */}
          {step === "generate" && (
            <motion.div
              key="generate"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="p-4 flex flex-col items-center justify-center min-h-[400px]"
            >
              <div className="relative">
                <div className="w-24 h-24 bg-gradient-to-br from-indigo-100 to-purple-100 rounded-2xl flex items-center justify-center">
                  <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
                </div>
                <div className="absolute -bottom-2 -right-2 w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center animate-pulse">
                  <Sparkles className="w-4 h-4 text-white" />
                </div>
              </div>
              <p className="mt-6 text-lg font-medium text-gray-900">
                Generating your image...
              </p>
              <p className="mt-2 text-sm text-gray-500 text-center max-w-xs">
                This may take a few seconds. The AI is crafting your image with
                care.
              </p>
            </motion.div>
          )}

          {/* Step 4: Result */}
          {step === "result" && resultImage && (
            <motion.div
              key="result"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="p-4 space-y-4"
            >
              {/* Result Image */}
              <div className="relative rounded-xl overflow-hidden bg-gray-100">
                <img
                  src={resultImage}
                  alt="Generated"
                  className="w-full h-auto"
                />
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={handleInsertToCanvas}
                  className="py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-medium rounded-xl hover:from-indigo-700 hover:to-purple-700 transition-all flex items-center justify-center gap-2"
                >
                  <Check className="w-5 h-5" />
                  Insert to Canvas
                </button>
                <button
                  onClick={reset}
                  className="py-3 bg-gray-100 text-gray-700 font-medium rounded-xl hover:bg-gray-200 transition-all flex items-center justify-center gap-2"
                >
                  <RotateCcw className="w-5 h-5" />
                  Create New
                </button>
              </div>

              {/* Regenerate Option */}
              <button
                onClick={() => {
                  useAiMagicStore.setState({ step: "optimize" });
                }}
                className="w-full py-2 text-sm text-gray-500 hover:text-indigo-600 transition-colors flex items-center justify-center gap-2"
              >
                <Edit3 className="w-4 h-4" />
                Edit prompt and regenerate
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Error Toast */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="absolute bottom-4 left-4 right-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center justify-between"
          >
            <p className="text-sm text-red-700">{error}</p>
            <button
              onClick={clearError}
              className="p-1 hover:bg-red-100 rounded"
            >
              <X className="w-4 h-4 text-red-500" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
