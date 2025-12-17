/**
 * Canvas Store - Unified State Management
 *
 * Manages all canvas state including:
 * - Project metadata (id, title)
 * - Viewport (pan, zoom)
 * - Elements (text, image, sticker)
 * - Selection and editing state
 * - History (undo/redo)
 * - Save status
 */

import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import type {
  CanvasElement,
  CanvasViewport,
  CanvasToolType,
  TextEditingState,
  CanvasProject,
} from "@/types/storage";
import { CANVAS_CONFIG } from "@/types/storage";

// ============================================
// Types
// ============================================

type SaveStatus = "idle" | "saving" | "saved" | "error";

interface HistoryEntry {
  elements: CanvasElement[];
  viewport: CanvasViewport;
}

interface CanvasState {
  // Project
  projectId: string | null;
  projectTitle: string;
  projectVersion: number; // 乐观锁版本号

  // Loading
  isLoading: boolean;
  loadError: string | null;

  // Viewport
  viewport: CanvasViewport;

  // Elements
  elements: CanvasElement[];

  // Selection & Editing
  selectedId: string | null;
  selectedIds: string[];  // 多选
  editingState: TextEditingState | null;

  // Marquee Selection (框选)
  isMarqueeSelecting: boolean;
  marqueeStartPoint: { x: number; y: number } | null;
  marqueeRect: { x: number; y: number; width: number; height: number } | null;

  // Tool
  tool: CanvasToolType;
  isPanning: boolean;

  // UI State
  showGrid: boolean;
  showToolbar: boolean;
  showStickerPicker: boolean;
  showPhotoSidebar: boolean;

  // Processing
  isProcessingBg: boolean;

  // Save
  saveStatus: SaveStatus;
  hasUnsavedChanges: boolean;
  hasConflict: boolean; // 是否有版本冲突
  serverConflictData: { elements: CanvasElement[]; viewport: CanvasViewport; version: number } | null; // 冲突时服务器数据

  // History
  history: HistoryEntry[];
  historyIndex: number;
  lastHistoryPushTime: number; // 上次 pushHistory 的时间，用于防抖

  // Clipboard
  clipboard: CanvasElement | null; // 剪贴板

  // Loaded fonts
  loadedFonts: Record<string, boolean>;
}

interface CanvasActions {
  // Project actions
  loadProject: () => Promise<void>;
  setProjectTitle: (title: string) => void;

  // Viewport actions
  setViewport: (viewport: Partial<CanvasViewport>) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetView: () => void;
  zoomToPoint: (
    pointerX: number,
    pointerY: number,
    stageX: number,
    stageY: number,
    direction: 1 | -1
  ) => void;

  // Element actions
  setElements: (elements: CanvasElement[]) => void;
  addElement: (element: CanvasElement) => void;
  updateElement: (id: string, updates: Partial<CanvasElement>) => void;
  deleteElement: (id: string) => void;
  moveLayer: (id: string, direction: "up" | "down" | "top" | "bottom") => void;

  // Selection actions
  setSelectedId: (id: string | null) => void;
  setSelectedIds: (ids: string[]) => void;
  addToSelection: (id: string) => void;
  removeFromSelection: (id: string) => void;
  toggleSelection: (id: string) => void;
  clearSelection: () => void;
  deleteSelectedElements: () => void;
  getSelectedElements: () => CanvasElement[];

  // Marquee selection actions
  startMarqueeSelect: (x: number, y: number) => void;
  updateMarqueeSelect: (x: number, y: number) => void;
  endMarqueeSelect: () => void;

  // Editing actions
  startEditing: (state: TextEditingState) => void;
  stopEditing: () => void;

  // Tool actions
  setTool: (tool: CanvasToolType) => void;
  setIsPanning: (isPanning: boolean) => void;

  // UI actions
  setShowGrid: (show: boolean) => void;
  toggleGrid: () => void;
  setShowToolbar: (show: boolean) => void;
  setShowStickerPicker: (show: boolean) => void;
  setShowPhotoSidebar: (show: boolean) => void;

  // Processing
  setIsProcessingBg: (processing: boolean) => void;

  // Save actions
  setSaveStatus: (status: SaveStatus) => void;
  markUnsaved: () => void;
  saveToServer: () => Promise<void>;
  resolveConflict: (useServer: boolean) => void; // 解决版本冲突
  setServerData: (data: { elements: CanvasElement[]; viewport: CanvasViewport; version: number }) => void;

  // History actions
  undo: () => void;
  redo: () => void;
  pushHistory: () => void;
  debouncedPushHistory: () => void; // 防抖版本，用于频繁操作如拖拽
  canUndo: () => boolean;
  canRedo: () => boolean;

  // Clipboard actions
  copyElement: () => void;
  pasteElement: () => void;

  // Font actions
  setFontLoaded: (font: string) => void;

  // Reset
  reset: () => void;

  // Helpers
  getCanvasCenter: (stageWidth: number, stageHeight: number) => { x: number; y: number };
  getSelectedElement: () => CanvasElement | undefined;
}

type CanvasStore = CanvasState & CanvasActions;

// ============================================
// Initial State
// ============================================

const DEFAULT_VIEWPORT: CanvasViewport = { x: 0, y: 0, zoom: 1 };

const initialState: CanvasState = {
  projectId: null,
  projectTitle: "My Journal",
  projectVersion: 1,
  isLoading: true,
  loadError: null,
  viewport: DEFAULT_VIEWPORT,
  elements: [],
  selectedId: null,
  selectedIds: [],
  editingState: null,
  isMarqueeSelecting: false,
  marqueeStartPoint: null,
  marqueeRect: null,
  tool: "select",
  isPanning: false,
  showGrid: true,
  showToolbar: true,
  showStickerPicker: false,
  showPhotoSidebar: false,
  isProcessingBg: false,
  saveStatus: "idle",
  hasUnsavedChanges: false,
  hasConflict: false,
  serverConflictData: null,
  history: [],
  historyIndex: -1,
  lastHistoryPushTime: 0,
  clipboard: null,
  loadedFonts: { Arial: true },
};

// ============================================
// Store
// ============================================

export const useCanvasStore = create<CanvasStore>()(
  subscribeWithSelector((set, get) => ({
    ...initialState,

    // ==========================================
    // Project Actions
    // ==========================================

    loadProject: async () => {
      set({ isLoading: true, loadError: null });

      try {
        const response = await fetch("/api/canvas/default");
        if (!response.ok) {
          throw new Error("Failed to load project");
        }

        const data = await response.json();
        const project: CanvasProject = data.project;

        set({
          projectId: project.id,
          projectTitle: project.title,
          projectVersion: project.version || 1,
          viewport: project.viewport || DEFAULT_VIEWPORT,
          elements: project.elements || [],
          isLoading: false,
          saveStatus: "saved",
          hasUnsavedChanges: false,
          hasConflict: false,
          // Initialize history with loaded state
          history: [
            {
              elements: project.elements || [],
              viewport: project.viewport || DEFAULT_VIEWPORT,
            },
          ],
          historyIndex: 0,
        });
      } catch (error) {
        console.error("Load error:", error);
        set({
          isLoading: false,
          loadError: error instanceof Error ? error.message : "Failed to load project",
        });
      }
    },

    setProjectTitle: (title) => {
      set({ projectTitle: title });
      get().markUnsaved();
    },

    // ==========================================
    // Viewport Actions
    // ==========================================

    setViewport: (updates) => {
      set((state) => ({
        viewport: { ...state.viewport, ...updates },
      }));
    },

    zoomIn: () => {
      set((state) => ({
        viewport: {
          ...state.viewport,
          zoom: Math.min(
            CANVAS_CONFIG.MAX_ZOOM,
            state.viewport.zoom + CANVAS_CONFIG.ZOOM_STEP * 2
          ),
        },
      }));
    },

    zoomOut: () => {
      set((state) => ({
        viewport: {
          ...state.viewport,
          zoom: Math.max(
            CANVAS_CONFIG.MIN_ZOOM,
            state.viewport.zoom - CANVAS_CONFIG.ZOOM_STEP * 2
          ),
        },
      }));
    },

    resetView: () => {
      set({ viewport: DEFAULT_VIEWPORT });
    },

    zoomToPoint: (pointerX, pointerY, stageX, stageY, direction) => {
      const { viewport } = get();
      const oldZoom = viewport.zoom;

      // Calculate mouse position in world coordinates
      const mousePointTo = {
        x: (pointerX - stageX) / oldZoom,
        y: (pointerY - stageY) / oldZoom,
      };

      // Calculate new zoom
      const newZoom = Math.max(
        CANVAS_CONFIG.MIN_ZOOM,
        Math.min(
          CANVAS_CONFIG.MAX_ZOOM,
          oldZoom + direction * CANVAS_CONFIG.ZOOM_STEP
        )
      );

      // Calculate new position to keep mouse point fixed
      const newX = pointerX - mousePointTo.x * newZoom;
      const newY = pointerY - mousePointTo.y * newZoom;

      set({
        viewport: { x: newX, y: newY, zoom: newZoom },
      });
    },

    // ==========================================
    // Element Actions
    // ==========================================

    setElements: (elements) => {
      set({ elements });
      get().markUnsaved();
    },

    addElement: (element) => {
      set((state) => ({
        elements: [...state.elements, element],
        selectedId: element.id,
      }));
      get().pushHistory();
      get().markUnsaved();
    },

    updateElement: (id, updates) => {
      set((state) => ({
        elements: state.elements.map((el) =>
          el.id === id ? { ...el, ...updates } : el
        ),
      }));
      get().markUnsaved();
      // 使用防抖版本记录历史，避免拖拽时产生过多历史记录
      get().debouncedPushHistory();
    },

    deleteElement: (id) => {
      set((state) => ({
        elements: state.elements.filter((el) => el.id !== id),
        selectedId: state.selectedId === id ? null : state.selectedId,
      }));
      get().pushHistory();
      get().markUnsaved();
    },

    moveLayer: (id, direction) => {
      const { elements } = get();
      const index = elements.findIndex((el) => el.id === id);
      if (index === -1) return;

      const newElements = [...elements];
      const element = newElements[index];
      newElements.splice(index, 1);

      switch (direction) {
        case "top":
          newElements.push(element);
          break;
        case "bottom":
          newElements.unshift(element);
          break;
        case "up":
          newElements.splice(Math.min(index + 1, newElements.length), 0, element);
          break;
        case "down":
          newElements.splice(Math.max(index - 1, 0), 0, element);
          break;
      }

      set({ elements: newElements });
      get().pushHistory();
      get().markUnsaved();
    },

    // ==========================================
    // Selection Actions
    // ==========================================

    setSelectedId: (id) => {
      set({ selectedId: id, selectedIds: id ? [id] : [] });
    },

    setSelectedIds: (ids) => {
      set({
        selectedIds: ids,
        selectedId: ids.length === 1 ? ids[0] : null,
      });
    },

    addToSelection: (id) => {
      const { selectedIds } = get();
      if (!selectedIds.includes(id)) {
        set({
          selectedIds: [...selectedIds, id],
          selectedId: null, // 多选时清除单选
        });
      }
    },

    removeFromSelection: (id) => {
      const { selectedIds } = get();
      const newIds = selectedIds.filter((i) => i !== id);
      set({
        selectedIds: newIds,
        selectedId: newIds.length === 1 ? newIds[0] : null,
      });
    },

    toggleSelection: (id) => {
      const { selectedIds } = get();
      if (selectedIds.includes(id)) {
        get().removeFromSelection(id);
      } else {
        get().addToSelection(id);
      }
    },

    clearSelection: () => {
      set({ selectedId: null, selectedIds: [] });
    },

    deleteSelectedElements: () => {
      const { elements, selectedIds, selectedId } = get();
      const idsToDelete = selectedIds.length > 0 ? selectedIds : (selectedId ? [selectedId] : []);

      if (idsToDelete.length === 0) return;

      set({
        elements: elements.filter((el) => !idsToDelete.includes(el.id)),
        selectedId: null,
        selectedIds: [],
      });
      get().pushHistory();
      get().markUnsaved();
    },

    getSelectedElements: () => {
      const { elements, selectedIds, selectedId } = get();
      if (selectedIds.length > 0) {
        return elements.filter((el) => selectedIds.includes(el.id));
      }
      if (selectedId) {
        const el = elements.find((e) => e.id === selectedId);
        return el ? [el] : [];
      }
      return [];
    },

    // ==========================================
    // Marquee Selection Actions
    // ==========================================

    startMarqueeSelect: (x, y) => {
      set({
        isMarqueeSelecting: true,
        marqueeStartPoint: { x, y },
        marqueeRect: { x, y, width: 0, height: 0 },
      });
    },

    updateMarqueeSelect: (x, y) => {
      const { marqueeStartPoint } = get();
      if (!marqueeStartPoint) return;

      // 计算矩形（支持反向拖拽）
      const rect = {
        x: Math.min(marqueeStartPoint.x, x),
        y: Math.min(marqueeStartPoint.y, y),
        width: Math.abs(x - marqueeStartPoint.x),
        height: Math.abs(y - marqueeStartPoint.y),
      };

      set({ marqueeRect: rect });
    },

    endMarqueeSelect: () => {
      const { marqueeRect, elements, selectedIds } = get();

      if (!marqueeRect || marqueeRect.width < 5 || marqueeRect.height < 5) {
        // 太小的框选视为点击，清除选择
        set({
          isMarqueeSelecting: false,
          marqueeStartPoint: null,
          marqueeRect: null,
        });
        return;
      }

      // 碰撞检测：找出框内的元素
      const selectedElements = elements.filter((el) => {
        const elRight = el.x + (el.width || 100);
        const elBottom = el.y + (el.height || 50);
        const rectRight = marqueeRect.x + marqueeRect.width;
        const rectBottom = marqueeRect.y + marqueeRect.height;

        // 检查元素是否与选择框相交
        return !(
          elRight < marqueeRect.x ||
          el.x > rectRight ||
          elBottom < marqueeRect.y ||
          el.y > rectBottom
        );
      });

      const newSelectedIds = selectedElements.map((el) => el.id);

      set({
        isMarqueeSelecting: false,
        marqueeStartPoint: null,
        marqueeRect: null,
        selectedIds: newSelectedIds,
        selectedId: newSelectedIds.length === 1 ? newSelectedIds[0] : null,
      });
    },

    // ==========================================
    // Editing Actions
    // ==========================================

    startEditing: (state) => {
      set({ editingState: state });
    },

    stopEditing: () => {
      set({ editingState: null });
    },

    // ==========================================
    // Tool Actions
    // ==========================================

    setTool: (tool) => {
      set({ tool });
    },

    setIsPanning: (isPanning) => {
      set({ isPanning });
    },

    // ==========================================
    // UI Actions
    // ==========================================

    setShowGrid: (show) => {
      set({ showGrid: show });
    },

    toggleGrid: () => {
      set((state) => ({ showGrid: !state.showGrid }));
    },

    setShowToolbar: (show) => {
      set({ showToolbar: show });
    },

    setShowStickerPicker: (show) => {
      set({ showStickerPicker: show });
    },

    setShowPhotoSidebar: (show) => {
      set({ showPhotoSidebar: show });
    },

    // ==========================================
    // Processing
    // ==========================================

    setIsProcessingBg: (processing) => {
      set({ isProcessingBg: processing });
    },

    // ==========================================
    // Save Actions
    // ==========================================

    setSaveStatus: (status) => {
      set({ saveStatus: status });
    },

    markUnsaved: () => {
      set({ hasUnsavedChanges: true, saveStatus: "idle" });
    },

    saveToServer: async () => {
      const { projectId, elements, viewport, hasUnsavedChanges, projectVersion } = get();

      if (!projectId || !hasUnsavedChanges) return;

      set({ saveStatus: "saving" });

      try {
        const response = await fetch(`/api/canvas/${projectId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ elements, viewport, expectedVersion: projectVersion }),
        });

        if (response.status === 409) {
          // 版本冲突
          const data = await response.json();
          set({
            saveStatus: "error",
            hasConflict: true,
            // 存储服务器数据到 store 而不是 window
            serverConflictData: data.latestProject ? {
              elements: data.latestProject.elements,
              viewport: data.latestProject.viewport,
              version: data.latestProject.version,
            } : null,
          });
          return;
        }

        if (!response.ok) {
          throw new Error("Failed to save");
        }

        const data = await response.json();
        set({
          saveStatus: "saved",
          hasUnsavedChanges: false,
          hasConflict: false,
          projectVersion: data.project.version, // 更新版本号
        });
      } catch (error) {
        console.error("Save error:", error);
        set({ saveStatus: "error" });
      }
    },

    // 解决版本冲突
    resolveConflict: (useServer: boolean) => {
      const { serverConflictData } = get();

      if (useServer && serverConflictData) {
        // 使用服务器数据
        set({
          elements: serverConflictData.elements,
          viewport: serverConflictData.viewport,
          projectVersion: serverConflictData.version,
          hasConflict: false,
          hasUnsavedChanges: false,
          saveStatus: "saved",
          serverConflictData: null,
        });
      } else {
        // 使用本地数据，强制保存（不带版本检查）
        const newVersion = serverConflictData ? serverConflictData.version : get().projectVersion;

        set({
          projectVersion: newVersion,
          hasConflict: false,
          serverConflictData: null,
        });

        // 重新触发保存
        get().saveToServer();
      }
    },

    // 设置服务器数据
    setServerData: (data) => {
      set({
        elements: data.elements,
        viewport: data.viewport,
        projectVersion: data.version,
        hasUnsavedChanges: false,
        hasConflict: false,
        saveStatus: "saved",
      });
    },

    // ==========================================
    // History Actions
    // ==========================================

    pushHistory: () => {
      set((state) => {
        // Truncate any redo history
        const newHistory = state.history.slice(0, state.historyIndex + 1);

        // Add current state
        newHistory.push({
          elements: [...state.elements],
          viewport: { ...state.viewport },
        });

        // Limit history size
        const maxHistory = 50;
        if (newHistory.length > maxHistory) {
          newHistory.shift();
        }

        return {
          history: newHistory,
          historyIndex: newHistory.length - 1,
          lastHistoryPushTime: Date.now(),
        };
      });
    },

    // 防抖版本的 pushHistory，用于拖拽等频繁操作
    debouncedPushHistory: () => {
      const { lastHistoryPushTime } = get();
      const now = Date.now();
      // 间隔至少 500ms 才记录一次历史
      if (now - lastHistoryPushTime > 500) {
        get().pushHistory();
      }
    },

    undo: () => {
      const { historyIndex, history } = get();

      if (historyIndex > 0) {
        const newIndex = historyIndex - 1;
        const entry = history[newIndex];

        set({
          elements: [...entry.elements],
          viewport: { ...entry.viewport },
          historyIndex: newIndex,
          selectedId: null,
        });

        get().markUnsaved();
      }
    },

    redo: () => {
      const { historyIndex, history } = get();

      if (historyIndex < history.length - 1) {
        const newIndex = historyIndex + 1;
        const entry = history[newIndex];

        set({
          elements: [...entry.elements],
          viewport: { ...entry.viewport },
          historyIndex: newIndex,
          selectedId: null,
        });

        get().markUnsaved();
      }
    },

    canUndo: () => {
      return get().historyIndex > 0;
    },

    canRedo: () => {
      const { historyIndex, history } = get();
      return historyIndex < history.length - 1;
    },

    // ==========================================
    // Clipboard Actions
    // ==========================================

    copyElement: () => {
      const element = get().getSelectedElement();
      if (element) {
        set({ clipboard: { ...element } });
      }
    },

    pasteElement: () => {
      const { clipboard } = get();
      if (!clipboard) return;

      // 创建新元素，偏移位置避免重叠
      const newElement: CanvasElement = {
        ...clipboard,
        id: `${clipboard.type}-${Date.now()}`,
        x: (clipboard.x || 0) + 20,
        y: (clipboard.y || 0) + 20,
      };

      get().addElement(newElement);
    },

    // ==========================================
    // Font Actions
    // ==========================================

    setFontLoaded: (font) => {
      set((state) => ({
        loadedFonts: { ...state.loadedFonts, [font]: true },
      }));
    },

    // ==========================================
    // Reset
    // ==========================================

    reset: () => {
      set(initialState);
    },

    // ==========================================
    // Helpers
    // ==========================================

    getCanvasCenter: (stageWidth, stageHeight) => {
      const { viewport } = get();
      return {
        x: -viewport.x + stageWidth / 2 / viewport.zoom,
        y: -viewport.y + stageHeight / 2 / viewport.zoom,
      };
    },

    getSelectedElement: () => {
      const { elements, selectedId } = get();
      return elements.find((el) => el.id === selectedId);
    },
  }))
);

// ============================================
// Selectors (for optimized re-renders)
// ============================================

export const selectViewport = (state: CanvasStore) => state.viewport;
export const selectElements = (state: CanvasStore) => state.elements;
export const selectSelectedId = (state: CanvasStore) => state.selectedId;
export const selectTool = (state: CanvasStore) => state.tool;
export const selectSaveStatus = (state: CanvasStore) => state.saveStatus;
export const selectShowGrid = (state: CanvasStore) => state.showGrid;
export const selectShowToolbar = (state: CanvasStore) => state.showToolbar;
export const selectIsLoading = (state: CanvasStore) => state.isLoading;
export const selectEditingState = (state: CanvasStore) => state.editingState;
export const selectHasConflict = (state: CanvasStore) => state.hasConflict;
export const selectProjectVersion = (state: CanvasStore) => state.projectVersion;
