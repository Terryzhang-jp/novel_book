/**
 * AI Magic Store
 *
 * Zustand 状态管理：管理 AI Magic sidebar 的状态
 */

import { create } from "zustand";
import type {
  AiMagicStep,
  AiMagicHistoryIndex,
  AiMagicOptimizeResponse,
} from "@/types/storage";

interface AiMagicState {
  // Sidebar 状态
  isOpen: boolean;
  step: AiMagicStep;

  // 用户输入
  userPrompt: string;
  inputImages: string[]; // base64 data URLs
  styleImages: string[]; // base64 data URLs

  // 优化结果
  optimizedPrompt: string;
  reasoning: string;
  suggestions: string[];

  // 生成结果
  resultImage: string | null;
  resultMimeType: string;

  // 加载状态
  isOptimizing: boolean;
  isGenerating: boolean;
  error: string | null;

  // 历史记录
  history: AiMagicHistoryIndex[];
  isLoadingHistory: boolean;

  // Actions: Sidebar
  openSidebar: () => void;
  closeSidebar: () => void;
  toggleSidebar: () => void;

  // Actions: 用户输入
  setUserPrompt: (prompt: string) => void;
  addInputImage: (image: string) => void;
  removeInputImage: (index: number) => void;
  addStyleImage: (image: string) => void;
  removeStyleImage: (index: number) => void;
  clearImages: () => void;

  // Actions: 步骤控制
  setStep: (step: AiMagicStep) => void;
  goBack: () => void;

  // Actions: 优化
  setOptimizedPrompt: (prompt: string) => void;
  optimize: () => Promise<void>;

  // Actions: 生成
  generate: () => Promise<void>;

  // Actions: 历史
  loadHistory: () => Promise<void>;
  deleteHistoryItem: (id: string) => Promise<void>;
  clearHistory: () => Promise<void>;
  useHistoryItem: (item: AiMagicHistoryIndex) => void;

  // Actions: 重置
  reset: () => void;
  clearError: () => void;
}

const initialState = {
  isOpen: false,
  step: "input" as AiMagicStep,
  userPrompt: "",
  inputImages: [],
  styleImages: [],
  optimizedPrompt: "",
  reasoning: "",
  suggestions: [],
  resultImage: null,
  resultMimeType: "image/png",
  isOptimizing: false,
  isGenerating: false,
  error: null,
  history: [],
  isLoadingHistory: false,
};

export const useAiMagicStore = create<AiMagicState>((set, get) => ({
  ...initialState,

  // Sidebar actions
  openSidebar: () => set({ isOpen: true }),
  closeSidebar: () => set({ isOpen: false }),
  toggleSidebar: () => set((state) => ({ isOpen: !state.isOpen })),

  // 用户输入 actions
  setUserPrompt: (prompt) => set({ userPrompt: prompt }),

  addInputImage: (image) =>
    set((state) => {
      if (state.inputImages.length >= 6) {
        return { error: "Maximum 6 input images allowed" };
      }
      return { inputImages: [...state.inputImages, image], error: null };
    }),

  removeInputImage: (index) =>
    set((state) => ({
      inputImages: state.inputImages.filter((_, i) => i !== index),
    })),

  addStyleImage: (image) =>
    set((state) => {
      if (state.styleImages.length >= 5) {
        return { error: "Maximum 5 style images allowed" };
      }
      return { styleImages: [...state.styleImages, image], error: null };
    }),

  removeStyleImage: (index) =>
    set((state) => ({
      styleImages: state.styleImages.filter((_, i) => i !== index),
    })),

  clearImages: () => set({ inputImages: [], styleImages: [] }),

  // 步骤控制
  setStep: (step) => set({ step }),

  goBack: () => {
    const { step } = get();
    if (step === "optimize") {
      set({ step: "input" });
    } else if (step === "generate") {
      set({ step: "optimize" });
    } else if (step === "result") {
      set({ step: "input", resultImage: null });
    }
  },

  // 优化 prompt
  setOptimizedPrompt: (prompt) => set({ optimizedPrompt: prompt }),

  optimize: async () => {
    const { userPrompt, inputImages, styleImages } = get();

    if (!userPrompt.trim()) {
      set({ error: "Please enter a description" });
      return;
    }

    set({ isOptimizing: true, error: null });

    try {
      const response = await fetch("/api/ai-magic/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userPrompt,
          inputImages: inputImages.length > 0 ? inputImages : undefined,
          styleImages: styleImages.length > 0 ? styleImages : undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to optimize prompt");
      }

      const result = data as AiMagicOptimizeResponse;

      set({
        optimizedPrompt: result.optimizedPrompt,
        reasoning: result.reasoning,
        suggestions: result.suggestions || [],
        step: "optimize",
        isOptimizing: false,
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : "Optimization failed",
        isOptimizing: false,
      });
    }
  },

  // 生成图像
  generate: async () => {
    const { optimizedPrompt, inputImages, styleImages, userPrompt, reasoning } =
      get();

    if (!optimizedPrompt.trim()) {
      set({ error: "Prompt is required" });
      return;
    }

    set({ isGenerating: true, error: null, step: "generate" });

    try {
      const response = await fetch("/api/ai-magic/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: optimizedPrompt,
          inputImages: inputImages.length > 0 ? inputImages : undefined,
          styleImages: styleImages.length > 0 ? styleImages : undefined,
          userPrompt,
          reasoning,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to generate image");
      }

      const resultImage = `data:${data.mimeType};base64,${data.image}`;

      set({
        resultImage,
        resultMimeType: data.mimeType,
        step: "result",
        isGenerating: false,
      });

      // 刷新历史
      get().loadHistory();
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : "Generation failed",
        isGenerating: false,
        step: "optimize", // 回到上一步
      });
    }
  },

  // 历史记录
  loadHistory: async () => {
    set({ isLoadingHistory: true });

    try {
      const response = await fetch("/api/ai-magic/history");
      const data = await response.json();

      if (response.ok) {
        set({ history: data.history || [], isLoadingHistory: false });
      } else {
        set({ isLoadingHistory: false });
      }
    } catch {
      set({ isLoadingHistory: false });
    }
  },

  deleteHistoryItem: async (id) => {
    try {
      const response = await fetch(`/api/ai-magic/history?id=${id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        set((state) => ({
          history: state.history.filter((item) => item.id !== id),
        }));
      }
    } catch (error) {
      console.error("Failed to delete history item:", error);
    }
  },

  clearHistory: async () => {
    try {
      const response = await fetch("/api/ai-magic/history?clearAll=true", {
        method: "DELETE",
      });

      if (response.ok) {
        set({ history: [] });
      }
    } catch (error) {
      console.error("Failed to clear history:", error);
    }
  },

  useHistoryItem: (item) => {
    set({
      userPrompt: item.userPrompt,
      step: "input",
    });
  },

  // 重置
  reset: () =>
    set({
      ...initialState,
      isOpen: true, // 保持 sidebar 打开
      history: get().history, // 保留历史
    }),

  clearError: () => set({ error: null }),
}));
