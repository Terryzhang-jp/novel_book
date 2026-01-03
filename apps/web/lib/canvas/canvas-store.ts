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
  MagazinePage,
  MagazineViewMode,
} from "@/types/storage";
import { CANVAS_CONFIG, A4_CONFIG } from "@/types/storage";
import { v4 as uuidv4 } from "uuid";

// ============================================
// 模块级保存锁 - 完全同步，比 store 状态更可靠
// ============================================
let _saveInProgress = false;
let _pendingSave = false;

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

  // Elements (无限画布模式使用)
  elements: CanvasElement[];

  // Magazine Mode (杂志模式)
  isMagazineMode: boolean;
  magazineViewMode: MagazineViewMode; // 'preview' | 'edit'
  pages: MagazinePage[];
  currentPageIndex: number; // 当前编辑的页面索引
  currentSpreadIndex: number; // 当前显示的 spread 索引 (0=封面, 1=1-2页, 2=3-4页...)

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
  showDocumentPicker: boolean;

  // Processing
  isProcessingBg: boolean;

  // Save
  saveStatus: SaveStatus;
  hasUnsavedChanges: boolean;

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
  setShowDocumentPicker: (show: boolean) => void;
  toggleDocumentPicker: () => void;

  // Processing
  setIsProcessingBg: (processing: boolean) => void;

  // Save actions
  setSaveStatus: (status: SaveStatus) => void;
  markUnsaved: () => void;
  saveToServer: () => Promise<void>;
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

  // Magazine Mode Actions
  setMagazineMode: (enabled: boolean) => void;
  setMagazineViewMode: (mode: MagazineViewMode) => void;
  enterEditMode: (pageIndex: number) => void;
  exitEditMode: () => void;

  // Page Management
  addPage: (afterIndex?: number) => void;
  deletePage: (pageIndex: number) => void;
  reorderPages: (fromIndex: number, toIndex: number) => void;
  updatePageElements: (pageIndex: number, elements: CanvasElement[]) => void;

  // Spread Navigation
  nextSpread: () => void;
  prevSpread: () => void;
  goToSpread: (spreadIndex: number) => void;
  getTotalSpreads: () => number;
  getSpreadPages: (spreadIndex: number) => [MagazinePage | null, MagazinePage | null];
  getCurrentPageElements: () => CanvasElement[];
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
  // Magazine Mode
  isMagazineMode: true, // 默认启用杂志模式
  magazineViewMode: "preview",
  pages: [],
  currentPageIndex: 0,
  currentSpreadIndex: 0,
  // Selection
  selectedId: null,
  selectedIds: [],
  editingState: null,
  isMarqueeSelecting: false,
  marqueeStartPoint: null,
  marqueeRect: null,
  tool: "select",
  isPanning: false,
  showGrid: false, // 杂志模式默认不显示网格
  showToolbar: true,
  showStickerPicker: false,
  showPhotoSidebar: false,
  showDocumentPicker: false,
  isProcessingBg: false,
  saveStatus: "idle",
  hasUnsavedChanges: false,
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

        console.log("[Store.loadProject] Loaded from server:", {
          projectId: project.id,
          isMagazineMode: project.isMagazineMode,
          pagesCount: project.pages?.length,
          pageElementsCounts: project.pages?.map(p => p.elements?.length),
          elementsCount: project.elements?.length,
          version: project.version,
        });

        // 判断是否为杂志模式
        const isMagazineMode = project.isMagazineMode ?? true; // 默认为杂志模式
        let pages = project.pages || [];

        // 如果是杂志模式但没有页面，创建一个初始封面页
        if (isMagazineMode && pages.length === 0) {
          pages = [
            {
              id: uuidv4(),
              index: 0,
              elements: [],
            },
          ];
        }

        set({
          projectId: project.id,
          projectTitle: project.title,
          projectVersion: project.version || 1,
          viewport: project.viewport || DEFAULT_VIEWPORT,
          elements: project.elements || [],
          // Magazine Mode
          isMagazineMode,
          pages,
          currentPageIndex: project.currentPageIndex || 0,
          currentSpreadIndex: 0,
          magazineViewMode: "preview",
          isLoading: false,
          saveStatus: "saved",
          hasUnsavedChanges: false,
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

    setShowDocumentPicker: (show) => {
      set({ showDocumentPicker: show });
    },

    toggleDocumentPicker: () => {
      set((state) => ({ showDocumentPicker: !state.showDocumentPicker }));
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
      const { projectId, hasUnsavedChanges } = get();

      if (!projectId || !hasUnsavedChanges) {
        return;
      }

      // 模块级锁 - 完全同步，保证串行化
      if (_saveInProgress) {
        _pendingSave = true;
        return;
      }

      _saveInProgress = true;
      _pendingSave = false;
      set({ saveStatus: "saving" });

      try {
        const {
          elements,
          viewport,
          isMagazineMode,
          pages,
          currentPageIndex,
          magazineViewMode,
        } = get();

        // 构建保存数据
        const saveData: Record<string, unknown> = {
          viewport,
          isMagazineMode,
        };

        if (isMagazineMode) {
          // 杂志模式：保存 pages
          let pagesToSave = pages;
          if (magazineViewMode === "edit") {
            pagesToSave = pages.map((page, idx) =>
              idx === currentPageIndex ? { ...page, elements } : page
            );
          }
          saveData.pages = pagesToSave;
          saveData.currentPageIndex = currentPageIndex;
          saveData.elements = [];
        } else {
          saveData.elements = elements;
        }

        const response = await fetch(`/api/canvas/${projectId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(saveData),
        });

        if (!response.ok) {
          throw new Error("Failed to save");
        }

        const data = await response.json();
        set({
          saveStatus: "saved",
          hasUnsavedChanges: false,
          projectVersion: data.project.version,
        });
      } catch (error) {
        console.error("Save error:", error);
        set({ saveStatus: "error" });
      } finally {
        _saveInProgress = false;

        // 检查待处理的保存
        if (_pendingSave && get().hasUnsavedChanges) {
          _pendingSave = false;
          setTimeout(() => get().saveToServer(), 50);
        }
      }
    },

    // 设置服务器数据
    // 注意：杂志编辑模式下不覆盖 elements，因为 elements 是当前编辑页面的临时数据
    setServerData: (data) => {
      const { isMagazineMode, magazineViewMode } = get();

      // 杂志编辑模式下，不覆盖 elements（避免丢失当前编辑内容）
      if (isMagazineMode && magazineViewMode === "edit") {
        set({
          viewport: data.viewport,
          projectVersion: data.version,
          hasUnsavedChanges: false,
          saveStatus: "saved",
        });
        return;
      }

      set({
        elements: data.elements,
        viewport: data.viewport,
        projectVersion: data.version,
        hasUnsavedChanges: false,
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

    // ==========================================
    // Magazine Mode Actions
    // ==========================================

    setMagazineMode: (enabled) => {
      set({ isMagazineMode: enabled });
      if (enabled && get().pages.length === 0) {
        // 创建初始封面页
        set({
          pages: [{ id: uuidv4(), index: 0, elements: [] }],
        });
      }
    },

    setMagazineViewMode: (mode) => {
      set({ magazineViewMode: mode });
    },

    enterEditMode: (pageIndex) => {
      const { pages } = get();
      if (pageIndex >= 0 && pageIndex < pages.length) {
        set({
          magazineViewMode: "edit",
          currentPageIndex: pageIndex,
          // 将当前页面的元素设置为活动元素（用于编辑）
          elements: pages[pageIndex].elements,
          selectedId: null,
          selectedIds: [],
        });
      }
    },

    exitEditMode: () => {
      const { pages, currentPageIndex, elements } = get();
      // 保存当前编辑的元素回到页面
      const updatedPages = pages.map((page, idx) =>
        idx === currentPageIndex ? { ...page, elements } : page
      );

      set({
        magazineViewMode: "preview",
        pages: updatedPages,
        elements: [], // 清空活动元素
        selectedId: null,
        selectedIds: [],
      });
      get().markUnsaved();
    },

    // ==========================================
    // Page Management
    // ==========================================

    addPage: (afterIndex) => {
      const { pages } = get();
      const insertIndex = afterIndex !== undefined ? afterIndex + 1 : pages.length;

      const newPage: MagazinePage = {
        id: uuidv4(),
        index: insertIndex,
        elements: [],
      };

      const newPages = [...pages];
      newPages.splice(insertIndex, 0, newPage);

      // 更新后续页面的 index
      const updatedPages = newPages.map((page, idx) => ({
        ...page,
        index: idx,
      }));

      set({ pages: updatedPages });
      get().pushHistory();
      get().markUnsaved();
    },

    deletePage: (pageIndex) => {
      const { pages } = get();
      if (pages.length <= 1) return; // 至少保留一页

      const newPages = pages.filter((_, idx) => idx !== pageIndex);
      // 更新 index
      const updatedPages = newPages.map((page, idx) => ({
        ...page,
        index: idx,
      }));

      // 调整当前 spread
      const totalSpreads = get().getTotalSpreads();
      const currentSpread = get().currentSpreadIndex;

      set({
        pages: updatedPages,
        currentSpreadIndex: Math.min(currentSpread, Math.max(0, totalSpreads - 1)),
      });
      get().pushHistory();
      get().markUnsaved();
    },

    reorderPages: (fromIndex, toIndex) => {
      const { pages } = get();
      if (fromIndex === toIndex) return;

      const newPages = [...pages];
      const [removed] = newPages.splice(fromIndex, 1);
      newPages.splice(toIndex, 0, removed);

      // 更新 index
      const updatedPages = newPages.map((page, idx) => ({
        ...page,
        index: idx,
      }));

      set({ pages: updatedPages });
      get().pushHistory();
      get().markUnsaved();
    },

    updatePageElements: (pageIndex, elements) => {
      const { pages } = get();
      const updatedPages = pages.map((page, idx) =>
        idx === pageIndex ? { ...page, elements } : page
      );
      set({ pages: updatedPages });
      get().markUnsaved();
    },

    // ==========================================
    // Spread Navigation
    // ==========================================

    getTotalSpreads: () => {
      const { pages } = get();
      if (pages.length === 0) return 0;
      if (pages.length === 1) return 1; // 只有封面
      // 封面占一个 spread，其余页面两两配对
      return 1 + Math.ceil((pages.length - 1) / 2);
    },

    getSpreadPages: (spreadIndex) => {
      const { pages } = get();

      if (spreadIndex === 0) {
        // 封面独占一个 spread
        return [pages[0] || null, null];
      }

      // 其他 spread：左右两页配对
      const leftPageIndex = spreadIndex * 2 - 1;
      const rightPageIndex = leftPageIndex + 1;

      return [
        pages[leftPageIndex] || null,
        pages[rightPageIndex] || null,
      ];
    },

    nextSpread: () => {
      const totalSpreads = get().getTotalSpreads();
      const current = get().currentSpreadIndex;
      if (current < totalSpreads - 1) {
        set({ currentSpreadIndex: current + 1 });
      }
    },

    prevSpread: () => {
      const current = get().currentSpreadIndex;
      if (current > 0) {
        set({ currentSpreadIndex: current - 1 });
      }
    },

    goToSpread: (spreadIndex) => {
      const totalSpreads = get().getTotalSpreads();
      if (spreadIndex >= 0 && spreadIndex < totalSpreads) {
        set({ currentSpreadIndex: spreadIndex });
      }
    },

    getCurrentPageElements: () => {
      const { isMagazineMode, magazineViewMode, pages, currentPageIndex, elements } = get();

      if (!isMagazineMode) {
        return elements;
      }

      if (magazineViewMode === "edit" && pages[currentPageIndex]) {
        return elements; // 编辑模式下使用活动元素
      }

      return pages[currentPageIndex]?.elements || [];
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
export const selectProjectVersion = (state: CanvasStore) => state.projectVersion;

// Magazine Mode Selectors
export const selectIsMagazineMode = (state: CanvasStore) => state.isMagazineMode;
export const selectMagazineViewMode = (state: CanvasStore) => state.magazineViewMode;
export const selectPages = (state: CanvasStore) => state.pages;
export const selectCurrentPageIndex = (state: CanvasStore) => state.currentPageIndex;
export const selectCurrentSpreadIndex = (state: CanvasStore) => state.currentSpreadIndex;
