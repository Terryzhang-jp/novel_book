'use client';

/**
 * MagazineEditor - 单页编辑模式
 *
 * 复用现有的 Konva 编辑逻辑，但限制在 A4 页面范围内：
 * - 固定页面尺寸（A4 比例）
 * - 禁用无限平移
 * - 保留所有元素编辑功能
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { Stage, Layer, Transformer, Rect } from 'react-konva';
import Konva from 'konva';
import { toast } from 'sonner';

// Store & Hooks
import { useCanvasStore } from '@/lib/canvas/canvas-store';
import {
  useCanvasKeyboard,
  useCanvasAutoSave,
  useFontLoader,
} from '@/lib/canvas/hooks';

// Components
import {
  CanvasRichText,
  CanvasImageElement,
  HtmlTextEditor,
} from '@/components/canvas/elements';
import { SelectionRect } from '@/components/canvas/elements/selection-rect';
// Toolbars now integrated into right panel
import { StickerPicker } from '@/components/canvas/sticker-picker';
import { DocumentPicker } from '@/components/canvas/document-picker';
import { CanvasPhotoSidebar } from '@/components/canvas/canvas-photo-sidebar';
import { AiSpotlight } from '@/components/canvas/ai-spotlight';
import { AiMagicSidebar } from '@/components/canvas/ai-magic-sidebar';
import { SamSegmentation } from '@/components/canvas/sam-segmentation';
import { ImageCropper } from '@/components/canvas/image-cropper';
import { useAiMagicStore } from '@/lib/canvas/ai-magic-store';
// Removed @imgly/background-removal due to ONNX version conflict with SAM
// Use Smart Cut (SAM) instead for background removal

// Types
import type { CanvasElement, TextEditingState } from '@/types/storage';
import { A4_CONFIG } from '@/types/storage';

// Canvas image upload utility
import { uploadCanvasImage, getImageDimensions, calculateFitDimensions } from '@/lib/canvas/upload-canvas-image';
import {
  ChevronLeft,
  Image,
  Type,
  Smile,
  Upload,
  Undo2,
  Redo2,
  Sparkles,
  Scissors,
  ArrowUp,
  ArrowDown,
  Palette,
  Crop,
  FileText,
  Check,
  Loader2,
  AlertCircle,
  CloudOff,
} from 'lucide-react';
import { JOURNAL_FONTS } from '@/types/storage';
import { cn } from '@/lib/utils';

export function MagazineEditor() {
  // Refs
  const stageRef = useRef<Konva.Stage>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Local state
  const [stageSize, setStageSize] = useState({ width: 1920, height: 1080 });
  const [showSpotlight, setShowSpotlight] = useState(false);
  const [showSamSegmentation, setShowSamSegmentation] = useState(false);
  const [showImageCropper, setShowImageCropper] = useState(false);
  const [pendingUploads, setPendingUploads] = useState(0); // Track pending image uploads

  // AI Magic
  const { isOpen: isAiMagicOpen, openSidebar: openAiMagicSidebar } = useAiMagicStore();

  // Store
  const {
    projectId,
    viewport,
    elements,
    addElement,
    updateElement,
    selectedId,
    selectedIds,
    setSelectedId,
    clearSelection,
    editingState,
    startEditing,
    stopEditing,
    isPanning,
    setIsPanning,
    showStickerPicker,
    setShowStickerPicker,
    showPhotoSidebar,
    setShowPhotoSidebar,
    showDocumentPicker,
    toggleDocumentPicker,
    getCanvasCenter,
    getSelectedElement,
    // Marquee selection
    isMarqueeSelecting,
    marqueeRect,
    startMarqueeSelect,
    updateMarqueeSelect,
    endMarqueeSelect,
    // Magazine mode
    currentPageIndex,
    pages,
    exitEditMode,
    // History
    undo,
    redo,
    canUndo,
    canRedo,
    // Layer
    moveLayer,
    // Save status
    saveStatus,
    hasUnsavedChanges,
  } = useCanvasStore();

  // Get selected element for property panel
  const selectedElement = getSelectedElement();

  // Hooks
  useCanvasKeyboard();
  useCanvasAutoSave();
  useFontLoader();

  // Calculate scale to fit page in viewport (larger page, minimal padding)
  const calculateScale = useCallback(() => {
    const paddingX = 80; // Side padding (account for right panel)
    const paddingY = 40; // Top/bottom padding
    const availableWidth = stageSize.width - paddingX * 2;
    const availableHeight = stageSize.height - paddingY * 2;

    const scaleX = availableWidth / A4_CONFIG.EDIT_WIDTH;
    const scaleY = availableHeight / A4_CONFIG.EDIT_HEIGHT;

    return Math.min(scaleX, scaleY, 1.5); // Allow larger scale for bigger page
  }, [stageSize]);

  const scale = calculateScale();

  // Update stage size on resize
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        setStageSize({
          width: containerRef.current.offsetWidth,
          height: containerRef.current.offsetHeight,
        });
      }
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  // Update transformer on selection change
  useEffect(() => {
    if (!transformerRef.current || !stageRef.current) return;

    if (selectedIds.length > 0) {
      const nodes = selectedIds
        .map((id) => stageRef.current?.findOne(`#${id}`))
        .filter(Boolean) as Konva.Node[];
      transformerRef.current.nodes(nodes);
      return;
    }

    if (selectedId) {
      const node = stageRef.current.findOne(`#${selectedId}`);
      if (node) {
        transformerRef.current.nodes([node]);
      }
    } else {
      transformerRef.current.nodes([]);
    }
  }, [selectedId, selectedIds]);

  // Calculate page position (centered)
  const pageX = (stageSize.width - A4_CONFIG.EDIT_WIDTH * scale) / 2;
  const pageY = (stageSize.height - A4_CONFIG.EDIT_HEIGHT * scale) / 2;

  // ==================== Handlers ====================

  const handleMouseDown = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      // Click on stage background
      if (e.target === e.target.getStage() || e.target.name() === 'page-background') {
        if (editingState) {
          stopEditing();
        }
        if (!e.evt.ctrlKey && !e.evt.metaKey) {
          clearSelection();
        }

        // Start marquee selection
        const stage = stageRef.current;
        if (stage) {
          const pointer = stage.getPointerPosition();
          if (pointer) {
            // Convert to page coordinates
            const canvasX = (pointer.x - pageX) / scale;
            const canvasY = (pointer.y - pageY) / scale;
            startMarqueeSelect(canvasX, canvasY);
          }
        }
      }
    },
    [editingState, stopEditing, clearSelection, startMarqueeSelect, pageX, pageY, scale]
  );

  const handleMouseMove = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (isMarqueeSelecting) {
        const stage = stageRef.current;
        if (stage) {
          const pointer = stage.getPointerPosition();
          if (pointer) {
            const canvasX = (pointer.x - pageX) / scale;
            const canvasY = (pointer.y - pageY) / scale;
            updateMarqueeSelect(canvasX, canvasY);
          }
        }
      }
    },
    [isMarqueeSelecting, updateMarqueeSelect, pageX, pageY, scale]
  );

  const handleMouseUp = useCallback(() => {
    if (isMarqueeSelecting) {
      endMarqueeSelect();
    }
  }, [isMarqueeSelecting, endMarqueeSelect]);

  // Handle text double-click for editing
  const handleTextDblClick = useCallback(
    (element: CanvasElement) => {
      if (element.type !== 'text' && element.type !== 'sticker') return;

      // Calculate screen position
      const screenX = pageX + (element.x || 0) * scale;
      const screenY = pageY + (element.y || 0) * scale;

      const editState: TextEditingState = {
        id: element.id,
        initialHtml: element.html || element.text || '',
        x: screenX,
        y: screenY,
        width: (element.width || 200) * scale,
        height: (element.height || 100) * scale,
        zoom: scale,
        style: {
          fontSize: element.fontSize || 16,
          fontFamily: element.fontFamily || 'Arial',
          fill: element.fill || '#000000',
        },
      };
      startEditing(editState);
    },
    [startEditing, pageX, pageY, scale]
  );

  // Add text element
  const handleAddText = useCallback(() => {
    const newElement: CanvasElement = {
      id: `text-${Date.now()}`,
      type: 'text',
      x: A4_CONFIG.EDIT_WIDTH / 2 - 100,
      y: A4_CONFIG.EDIT_HEIGHT / 2 - 25,
      width: 200,
      height: 50,
      text: 'Double-click to edit',
      html: 'Double-click to edit',
      fontSize: 24,
      fontFamily: 'Arial',
      fill: '#000000',
    };
    addElement(newElement);
  }, [addElement]);

  // Handle document text selection - insert text from document
  const handleDocumentTextSelect = useCallback(
    (text: string) => {
      const newElement: CanvasElement = {
        id: `doc-text-${Date.now()}`,
        type: 'text',
        x: A4_CONFIG.EDIT_WIDTH / 2 - 150,
        y: A4_CONFIG.EDIT_HEIGHT / 2 - 25,
        width: 300,
        text,
        html: text,
        fontSize: 24,
        fontFamily: 'Noto Sans SC',
        fill: '#333333',
      };
      addElement(newElement);
      toggleDocumentPicker();
    },
    [addElement, toggleDocumentPicker]
  );

  // Handle file upload - immediately upload to Supabase
  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !projectId) return;

      const reader = new FileReader();
      reader.onload = async (event) => {
        const dataUrl = event.target?.result as string;

        setPendingUploads(prev => prev + 1);
        try {
          // Immediately upload to Supabase, get URL back
          const url = await uploadCanvasImage(projectId, dataUrl);

          // Get dimensions from the uploaded image URL
          const dimensions = await getImageDimensions(url);
          const fitted = calculateFitDimensions(
            dimensions.width,
            dimensions.height,
            A4_CONFIG.EDIT_WIDTH * 0.8
          );

          const newElement: CanvasElement = {
            id: `image-${Date.now()}`,
            type: 'image',
            x: (A4_CONFIG.EDIT_WIDTH - fitted.width) / 2,
            y: (A4_CONFIG.EDIT_HEIGHT - fitted.height) / 2,
            width: fitted.width,
            height: fitted.height,
            src: url, // Use Supabase URL, not base64
          };
          addElement(newElement);

          toast.success('图片已添加');
        } catch (error) {
          console.error('Failed to upload image:', error);
          toast.error('图片上传失败');
        } finally {
          setPendingUploads(prev => prev - 1);
        }
      };
      reader.readAsDataURL(file);

      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    [addElement, projectId]
  );

  // Handle sticker selection
  const handleStickerSelect = useCallback(
    (emoji: string) => {
      const newElement: CanvasElement = {
        id: `sticker-${Date.now()}`,
        type: 'sticker',
        x: A4_CONFIG.EDIT_WIDTH / 2 - 30,
        y: A4_CONFIG.EDIT_HEIGHT / 2 - 30,
        width: 60,
        height: 60,
        text: emoji,
        fontSize: 48,
      };
      addElement(newElement);
      setShowStickerPicker(false);
    },
    [addElement, setShowStickerPicker]
  );

  // Handle photo selection from sidebar
  const handlePhotoSelect = useCallback(
    (photoUrl: string) => {
      const img = new window.Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const maxWidth = A4_CONFIG.EDIT_WIDTH * 0.6;
        const ratio = Math.min(1, maxWidth / img.width);

        const newElement: CanvasElement = {
          id: `image-${Date.now()}`,
          type: 'image',
          x: (A4_CONFIG.EDIT_WIDTH - img.width * ratio) / 2,
          y: (A4_CONFIG.EDIT_HEIGHT - img.height * ratio) / 2,
          width: img.width * ratio,
          height: img.height * ratio,
          src: photoUrl,
        };
        addElement(newElement);
      };
      img.src = photoUrl;
    },
    [addElement]
  );

  
  // Handle SAM segmentation result - immediately upload to Supabase
  const handleSamComplete = useCallback(
    async (resultDataUrl: string) => {
      const element = getSelectedElement();
      if (!element || element.type !== 'image' || !projectId) return;

      setPendingUploads(prev => prev + 1);
      try {
        // Upload the SAM result to Supabase
        const url = await uploadCanvasImage(projectId, resultDataUrl);

        updateElement(element.id, { src: url });
        toast.success('背景已移除');
      } catch (error) {
        console.error('Failed to upload SAM result:', error);
        toast.error('保存失败');
      } finally {
        setPendingUploads(prev => prev - 1);
      }
    },
    [getSelectedElement, updateElement, projectId]
  );

  // Handle crop complete - immediately upload to Supabase
  const handleCropComplete = useCallback(
    async (croppedImageDataUrl: string) => {
      const element = getSelectedElement();
      if (!element || element.type !== 'image' || !projectId) return;

      setPendingUploads(prev => prev + 1);
      try {
        // Upload the cropped image to Supabase
        const url = await uploadCanvasImage(projectId, croppedImageDataUrl);

        // Get dimensions from the uploaded image
        const dimensions = await getImageDimensions(url);

        // Calculate new dimensions while maintaining aspect ratio
        const oldWidth = element.width || 200;
        const oldHeight = element.height || 200;
        const maxDimension = Math.max(oldWidth, oldHeight);
        const scale = Math.min(maxDimension / dimensions.width, maxDimension / dimensions.height, 1);

        updateElement(element.id, {
          src: url,
          width: dimensions.width * scale,
          height: dimensions.height * scale,
        });
        toast.success('裁剪完成');
      } catch (error) {
        console.error('Failed to upload cropped image:', error);
        toast.error('裁剪保存失败');
      } finally {
        setPendingUploads(prev => prev - 1);
      }

      setShowImageCropper(false);
    },
    [getSelectedElement, updateElement, projectId]
  );

  // Handle AI generated image insert - immediately upload to Supabase
  const handleInsertFromAiMagic = useCallback(
    async (imageDataUrl: string) => {
      if (!projectId) return;

      setPendingUploads(prev => prev + 1);
      try {
        // Upload to Supabase
        const url = await uploadCanvasImage(projectId, imageDataUrl);

        // Get dimensions
        const dimensions = await getImageDimensions(url);
        const fitted = calculateFitDimensions(
          dimensions.width,
          dimensions.height,
          A4_CONFIG.EDIT_WIDTH * 0.8
        );

        addElement({
          id: `ai-magic-${Date.now()}`,
          type: 'image',
          x: (A4_CONFIG.EDIT_WIDTH - fitted.width) / 2,
          y: (A4_CONFIG.EDIT_HEIGHT - fitted.height) / 2,
          width: fitted.width,
          height: fitted.height,
          src: url,
        });
        toast.success('AI 图片已添加');
      } catch (error) {
        console.error('Failed to upload AI image:', error);
        toast.error('AI 图片添加失败');
      } finally {
        setPendingUploads(prev => prev - 1);
      }
    },
    [addElement, projectId]
  );

  const currentPage = pages[currentPageIndex];

  // Stable callbacks for text properties
  const handleFontChange = useCallback((fontFamily: string) => {
    if (selectedElement?.type === 'text') {
      updateElement(selectedElement.id, { fontFamily });
    }
  }, [selectedElement?.id, selectedElement?.type, updateElement]);

  const handleFontSizeChange = useCallback((fontSize: number) => {
    if (selectedElement?.type === 'text') {
      updateElement(selectedElement.id, { fontSize: Math.max(8, Math.min(200, fontSize)) });
    }
  }, [selectedElement?.id, selectedElement?.type, updateElement]);

  const handleColorChange = useCallback((fill: string) => {
    if (selectedElement?.type === 'text') {
      updateElement(selectedElement.id, { fill });
    }
  }, [selectedElement?.id, selectedElement?.type, updateElement]);

  return (
    <div ref={containerRef} className="fixed inset-0 bg-neutral-100 dark:bg-neutral-900 flex flex-col">
      {/* Right Side Tool Panel */}
      <aside className="fixed right-4 top-1/2 -translate-y-1/2 z-20 flex gap-3">
        {/* Selection Properties Panel - shows when element selected */}
        {selectedElement && !editingState && (
          <div className="flex flex-col gap-2 p-2 rounded-2xl bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 shadow-lg">
            {/* Text Properties */}
            {selectedElement.type === 'text' && (
              <>
                <div className="px-1 py-0.5">
                  <span className="text-[10px] text-neutral-400 uppercase tracking-wider">Text</span>
                </div>
                {/* Font Family */}
                <select
                  value={selectedElement.fontFamily || 'Arial'}
                  onChange={(e) => handleFontChange(e.target.value)}
                  className="w-28 h-9 px-2 text-xs bg-neutral-100 dark:bg-neutral-700 rounded-lg border-0 outline-none cursor-pointer text-neutral-700 dark:text-neutral-200"
                >
                  {JOURNAL_FONTS.map((font) => (
                    <option key={font} value={font}>{font}</option>
                  ))}
                </select>
                {/* Font Size */}
                <select
                  value={selectedElement.fontSize || 24}
                  onChange={(e) => handleFontSizeChange(Number(e.target.value))}
                  className="w-28 h-9 px-2 text-xs bg-neutral-100 dark:bg-neutral-700 rounded-lg border-0 outline-none cursor-pointer text-neutral-700 dark:text-neutral-200"
                >
                  {[12, 16, 20, 24, 32, 48, 64, 96].map((size) => (
                    <option key={size} value={size}>{size}px</option>
                  ))}
                </select>
                {/* Color */}
                <div className="flex items-center gap-2 px-2 h-9 bg-neutral-100 dark:bg-neutral-700 rounded-lg">
                  <Palette className="w-3.5 h-3.5 text-neutral-400" />
                  <input
                    type="color"
                    value={selectedElement.fill || '#333333'}
                    onChange={(e) => handleColorChange(e.target.value)}
                    className="w-6 h-6 rounded cursor-pointer border-0 bg-transparent"
                  />
                </div>
                <div className="w-full h-px bg-neutral-200 dark:bg-neutral-700" />
              </>
            )}

            {/* Image Properties */}
            {selectedElement.type === 'image' && (
              <>
                <div className="px-1 py-0.5">
                  <span className="text-[10px] text-neutral-400 uppercase tracking-wider">Image</span>
                </div>
                <button
                  onClick={() => setShowImageCropper(true)}
                  className="w-28 h-9 px-2 text-xs bg-neutral-100 dark:bg-neutral-700 rounded-lg flex items-center gap-2 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200 dark:hover:bg-neutral-600 transition-all"
                  title="Crop image"
                >
                  <Crop className="w-3.5 h-3.5" />
                  <span>Crop</span>
                </button>
                <button
                  onClick={() => setShowSamSegmentation(true)}
                  className="w-28 h-9 px-2 text-xs bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center gap-2 text-purple-700 dark:text-purple-300 hover:bg-purple-200 dark:hover:bg-purple-800/40 transition-all"
                  title="Click to select what to keep/remove"
                >
                  <Scissors className="w-3.5 h-3.5" />
                  <span>Remove BG</span>
                </button>
                <button
                  onClick={() => setShowSpotlight(true)}
                  className="w-28 h-9 px-2 text-xs bg-neutral-100 dark:bg-neutral-700 rounded-lg flex items-center gap-2 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200 dark:hover:bg-neutral-600 transition-all"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>AI Edit</span>
                </button>
                <div className="w-full h-px bg-neutral-200 dark:bg-neutral-700" />
              </>
            )}

            {/* Layer Controls */}
            <div className="px-1 py-0.5">
              <span className="text-[10px] text-neutral-400 uppercase tracking-wider">Layer</span>
            </div>
            <div className="grid grid-cols-2 gap-1">
              <button
                onClick={() => moveLayer(selectedElement.id, 'up')}
                className="h-9 px-2 text-xs bg-neutral-100 dark:bg-neutral-700 rounded-lg flex items-center justify-center gap-1 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200 dark:hover:bg-neutral-600 transition-all"
                title="Bring Forward"
              >
                <ArrowUp className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => moveLayer(selectedElement.id, 'down')}
                className="h-9 px-2 text-xs bg-neutral-100 dark:bg-neutral-700 rounded-lg flex items-center justify-center gap-1 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200 dark:hover:bg-neutral-600 transition-all"
                title="Send Backward"
              >
                <ArrowDown className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Main Tool Panel */}
        <div className="flex flex-col gap-3 p-2 rounded-2xl bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 shadow-lg">
          {/* Done Button */}
          <button
            onClick={exitEditMode}
            className="w-11 h-11 rounded-xl bg-neutral-900 dark:bg-white flex items-center justify-center text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-100 transition-all"
            title="Done - Back to Preview"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <div className="w-full h-px bg-neutral-200 dark:bg-neutral-700" />

          {/* Add Tools */}
          <div className="flex flex-col gap-1.5">
            <button
              onClick={() => setShowPhotoSidebar(true)}
              className="w-11 h-11 rounded-xl bg-neutral-100 dark:bg-neutral-700 flex items-center justify-center text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200 dark:hover:bg-neutral-600 transition-all"
              title="Photos"
            >
              <Image className="w-5 h-5" />
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-11 h-11 rounded-xl bg-neutral-100 dark:bg-neutral-700 flex items-center justify-center text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200 dark:hover:bg-neutral-600 transition-all"
              title="Upload Image"
            >
              <Upload className="w-5 h-5" />
            </button>
            <button
              onClick={handleAddText}
              className="w-11 h-11 rounded-xl bg-neutral-100 dark:bg-neutral-700 flex items-center justify-center text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200 dark:hover:bg-neutral-600 transition-all"
              title="Add Text"
            >
              <Type className="w-5 h-5" />
            </button>
            <button
              onClick={() => setShowStickerPicker(true)}
              className="w-11 h-11 rounded-xl bg-neutral-100 dark:bg-neutral-700 flex items-center justify-center text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200 dark:hover:bg-neutral-600 transition-all"
              title="Add Sticker"
            >
              <Smile className="w-5 h-5" />
            </button>
            <button
              onClick={openAiMagicSidebar}
              className="w-11 h-11 rounded-xl bg-neutral-100 dark:bg-neutral-700 flex items-center justify-center text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200 dark:hover:bg-neutral-600 transition-all"
              title="AI Magic"
            >
              <Sparkles className="w-5 h-5" />
            </button>
            <button
              onClick={toggleDocumentPicker}
              className={cn(
                "w-11 h-11 rounded-xl flex items-center justify-center transition-all",
                showDocumentPicker
                  ? "bg-indigo-500 text-white"
                  : "bg-neutral-100 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200 dark:hover:bg-neutral-600"
              )}
              title="从文档插入文字"
            >
              <FileText className="w-5 h-5" />
            </button>
          </div>

          <div className="w-full h-px bg-neutral-200 dark:bg-neutral-700" />

          {/* History */}
          <div className="flex flex-col gap-1.5">
            <button
              onClick={undo}
              disabled={!canUndo()}
              className="w-11 h-11 rounded-xl bg-neutral-100 dark:bg-neutral-700 flex items-center justify-center text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200 dark:hover:bg-neutral-600 disabled:opacity-30 transition-all"
              title="Undo (Ctrl+Z)"
            >
              <Undo2 className="w-4 h-4" />
            </button>
            <button
              onClick={redo}
              disabled={!canRedo()}
              className="w-11 h-11 rounded-xl bg-neutral-100 dark:bg-neutral-700 flex items-center justify-center text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200 dark:hover:bg-neutral-600 disabled:opacity-30 transition-all"
              title="Redo (Ctrl+Shift+Z)"
            >
              <Redo2 className="w-4 h-4" />
            </button>
          </div>

          {/* Page Indicator */}
          <div className="w-11 h-11 rounded-xl bg-neutral-900 dark:bg-white flex items-center justify-center">
            <span className="text-sm font-semibold text-white dark:text-neutral-900">
              {currentPageIndex === 0 ? 'C' : currentPageIndex}
            </span>
          </div>
        </div>
      </aside>

      {/* Save Status Indicator - Bottom Left */}
      <div className="fixed left-4 bottom-4 z-20 flex items-center gap-2 px-3 py-2 rounded-xl bg-white/90 dark:bg-neutral-800/90 backdrop-blur-sm border border-neutral-200 dark:border-neutral-700 shadow-lg">
        {/* Element Count */}
        <div className="flex items-center gap-1.5 text-sm text-neutral-600 dark:text-neutral-300">
          <span className="font-medium">{elements.length}</span>
          <span className="text-neutral-400">个元素</span>
        </div>

        <div className="w-px h-4 bg-neutral-200 dark:bg-neutral-600" />

        {/* Save Status */}
        <div className="flex items-center gap-1.5">
          {pendingUploads > 0 ? (
            // Uploading images
            <>
              <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
              <span className="text-sm text-blue-600 dark:text-blue-400">
                上传中 ({pendingUploads})
              </span>
            </>
          ) : saveStatus === 'saving' ? (
            // Saving to server
            <>
              <Loader2 className="w-4 h-4 text-amber-500 animate-spin" />
              <span className="text-sm text-amber-600 dark:text-amber-400">保存中...</span>
            </>
          ) : saveStatus === 'error' ? (
            // Save error
            <>
              <AlertCircle className="w-4 h-4 text-red-500" />
              <span className="text-sm text-red-600 dark:text-red-400">保存失败</span>
            </>
          ) : hasUnsavedChanges ? (
            // Has unsaved changes
            <>
              <CloudOff className="w-4 h-4 text-neutral-400" />
              <span className="text-sm text-neutral-500">未保存</span>
            </>
          ) : (
            // All saved
            <>
              <Check className="w-4 h-4 text-green-500" />
              <span className="text-sm text-green-600 dark:text-green-400">已保存</span>
            </>
          )}
        </div>
      </div>

      {/* Canvas - full height */}
      <main className="flex-1 overflow-hidden">
        <Stage
          ref={stageRef}
          width={stageSize.width}
          height={stageSize.height}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
        >
          <Layer>
            {/* Page Background (white A4) */}
            <Rect
              name="page-background"
              x={pageX}
              y={pageY}
              width={A4_CONFIG.EDIT_WIDTH * scale}
              height={A4_CONFIG.EDIT_HEIGHT * scale}
              fill="white"
              shadowColor="black"
              shadowBlur={20}
              shadowOpacity={0.1}
              shadowOffsetY={5}
            />
          </Layer>

          {/* Elements Layer */}
          <Layer
            x={pageX}
            y={pageY}
            scaleX={scale}
            scaleY={scale}
            clipX={0}
            clipY={0}
            clipWidth={A4_CONFIG.EDIT_WIDTH}
            clipHeight={A4_CONFIG.EDIT_HEIGHT}
          >
            {elements.map((el) => {
              if (el.type === 'text' || el.type === 'sticker') {
                if (editingState?.id === el.id) return null;
                return (
                  <CanvasRichText
                    key={el.id}
                    element={el}
                    isSelected={selectedId === el.id || selectedIds.includes(el.id)}
                    onSelect={() => setSelectedId(el.id)}
                    onDblClick={() => handleTextDblClick(el)}
                    onUpdate={(id, updates) => updateElement(id, updates)}
                  />
                );
              }

              if (el.type === 'image') {
                return (
                  <CanvasImageElement
                    key={el.id}
                    element={el}
                    isSelected={selectedId === el.id || selectedIds.includes(el.id)}
                    onSelect={() => setSelectedId(el.id)}
                    onUpdate={(id, updates) => updateElement(id, updates)}
                  />
                );
              }

              return null;
            })}

            {/* Marquee Selection Rect */}
            {isMarqueeSelecting && marqueeRect && (
              <SelectionRect rect={marqueeRect} />
            )}

            {/* Transformer */}
            <Transformer
              ref={transformerRef}
              rotateEnabled={true}
              enabledAnchors={[
                'top-left',
                'top-right',
                'bottom-left',
                'bottom-right',
                'middle-left',
                'middle-right',
                'top-center',
                'bottom-center',
              ]}
              boundBoxFunc={(oldBox, newBox) => {
                // Prevent negative dimensions
                if (newBox.width < 20 || newBox.height < 20) {
                  return oldBox;
                }
                return newBox;
              }}
            />
          </Layer>
        </Stage>
      </main>

      {/* AI Spotlight */}
      {showSpotlight && (
        <AiSpotlight
          selectedImage={getSelectedElement()?.type === 'image' ? getSelectedElement()?.src : null}
          onGenerate={async (src) => {
            if (!projectId) {
              setShowSpotlight(false);
              return;
            }
            setPendingUploads(prev => prev + 1);
            try {
              const url = await uploadCanvasImage(projectId, src);
              const dimensions = await getImageDimensions(url);
              const fitted = calculateFitDimensions(dimensions.width, dimensions.height, A4_CONFIG.EDIT_WIDTH * 0.8);

              addElement({
                id: `ai-${Date.now()}`,
                type: 'image',
                x: (A4_CONFIG.EDIT_WIDTH - fitted.width) / 2,
                y: (A4_CONFIG.EDIT_HEIGHT - fitted.height) / 2,
                width: fitted.width,
                height: fitted.height,
                src: url,
              });
              toast.success('AI 图片已添加');
            } catch (error) {
              console.error('Failed to upload AI image:', error);
              toast.error('AI 图片添加失败');
            } finally {
              setPendingUploads(prev => prev - 1);
            }
            setShowSpotlight(false);
          }}
          onEdit={async (newSrc) => {
            const selected = getSelectedElement();
            if (!selected || !projectId) {
              setShowSpotlight(false);
              return;
            }
            setPendingUploads(prev => prev + 1);
            try {
              const url = await uploadCanvasImage(projectId, newSrc);
              updateElement(selected.id, { src: url });
              toast.success('编辑已保存');
            } catch (error) {
              console.error('Failed to upload edited image:', error);
              toast.error('保存失败');
            } finally {
              setPendingUploads(prev => prev - 1);
            }
            setShowSpotlight(false);
          }}
          onClose={() => setShowSpotlight(false)}
        />
      )}

      {/* AI Magic Sidebar */}
      <AiMagicSidebar onInsertImage={handleInsertFromAiMagic} />

      {/* SAM Segmentation Modal */}
      {showSamSegmentation && selectedElement?.type === 'image' && selectedElement.src && (
        <SamSegmentation
          imageSrc={selectedElement.src}
          onComplete={handleSamComplete}
          onClose={() => setShowSamSegmentation(false)}
        />
      )}

      {/* Image Cropper Modal */}
      {showImageCropper && selectedElement?.type === 'image' && selectedElement.src && (
        <ImageCropper
          imageSrc={selectedElement.src}
          onComplete={handleCropComplete}
          onClose={() => setShowImageCropper(false)}
        />
      )}

      {/* HTML Text Editor Overlay */}
      {editingState && (
        <HtmlTextEditor
          editingState={editingState}
          onChange={(html: string) => {
            // 将 HTML 转换为纯文本，保留换行
            const htmlToText = (htmlContent: string): string => {
              return htmlContent
                .replace(/<br\s*\/?>/gi, '\n')           // <br> -> 换行
                .replace(/<\/div><div>/gi, '\n')          // </div><div> -> 换行
                .replace(/<\/p><p>/gi, '\n')              // </p><p> -> 换行
                .replace(/<div>/gi, '')                   // 移除开始 div
                .replace(/<\/div>/gi, '\n')               // </div> -> 换行
                .replace(/<p>/gi, '')                     // 移除开始 p
                .replace(/<\/p>/gi, '\n')                 // </p> -> 换行
                .replace(/<[^>]*>/g, '')                  // 移除其他 HTML 标签
                .replace(/&nbsp;/g, ' ')                  // &nbsp; -> 空格
                .replace(/\n+/g, '\n')                    // 合并多个换行
                .trim();
            };
            updateElement(editingState.id, {
              html,
              text: htmlToText(html),
            });
          }}
          onBlur={stopEditing}
        />
      )}

      {/* Sticker Picker */}
      {showStickerPicker && (
        <StickerPicker
          onSelect={handleStickerSelect}
          onClose={() => setShowStickerPicker(false)}
        />
      )}

      {/* Document Picker */}
      {showDocumentPicker && (
        <DocumentPicker
          onSelect={handleDocumentTextSelect}
          onClose={toggleDocumentPicker}
        />
      )}

      {/* Photo Sidebar */}
      <CanvasPhotoSidebar
        isOpen={showPhotoSidebar}
        onToggle={setShowPhotoSidebar}
        onPhotoSelect={(photoUrl, width, height) => {
          const maxWidth = A4_CONFIG.EDIT_WIDTH * 0.6;
          const ratio = Math.min(1, maxWidth / width);
          const newElement: CanvasElement = {
            id: `image-${Date.now()}`,
            type: 'image',
            x: (A4_CONFIG.EDIT_WIDTH - width * ratio) / 2,
            y: (A4_CONFIG.EDIT_HEIGHT - height * ratio) / 2,
            width: width * ratio,
            height: height * ratio,
            src: photoUrl,
          };
          addElement(newElement);
        }}
      />

      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileUpload}
        className="hidden"
      />
    </div>
  );
}
