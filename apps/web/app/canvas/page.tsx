/**
 * Infinite Canvas Journal
 *
 * A full-featured canvas for creating visual journals with:
 * - Infinite pan/zoom
 * - Text, images, and stickers
 * - AI-powered image generation
 * - Auto-save to Supabase
 */

"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { Stage, Layer, Transformer } from "react-konva";
import Konva from "konva";
import { removeBackground as imglyRemoveBackground } from "@imgly/background-removal";
import { toast } from "sonner";

// Store & Hooks
import { useCanvasStore } from "@/lib/canvas/canvas-store";
import {
  useCanvasKeyboard,
  useCanvasAutoSave,
  useToolbarVisibility,
  useFontLoader,
} from "@/lib/canvas/hooks";

// Components
import {
  CanvasRichText,
  CanvasImageElement,
  HtmlTextEditor,
  CanvasGrid,
} from "@/components/canvas/elements";
import { SelectionRect } from "@/components/canvas/elements/selection-rect";
import {
  CanvasTopToolbar,
  LayerToolbar,
  TextPropertiesToolbar,
  ZoomControls,
  CanvasHints,
} from "@/components/canvas/toolbars";
import { StickerPicker } from "@/components/canvas/sticker-picker";
import { AiSpotlight } from "@/components/canvas/ai-spotlight";
import { AiMagicSidebar } from "@/components/canvas/ai-magic-sidebar";
import { CanvasPhotoSidebar } from "@/components/canvas/canvas-photo-sidebar";
import { useAiMagicStore } from "@/lib/canvas/ai-magic-store";
import { CanvasErrorBoundary } from "@/components/canvas/canvas-error-boundary";
import { CanvasEmptyState } from "@/components/canvas/canvas-empty-state";
import { CanvasLoading } from "@/components/canvas/canvas-loading";

// Types
import type { CanvasElement, TextEditingState } from "@/types/storage";
import { CANVAS_CONFIG } from "@/types/storage";

export default function InfiniteCanvasPage() {
  // Refs
  const stageRef = useRef<Konva.Stage>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Local state
  const [stageSize, setStageSize] = useState({ width: 1920, height: 1080 });
  const [lastPointerPos, setLastPointerPos] = useState({ x: 0, y: 0 });
  const [showSpotlight, setShowSpotlight] = useState(false);

  // Store
  const {
    isLoading,
    loadProject,
    viewport,
    setViewport,
    zoomToPoint,
    elements,
    addElement,
    updateElement,
    selectedId,
    selectedIds,
    setSelectedId,
    clearSelection,
    toggleSelection,
    editingState,
    startEditing,
    stopEditing,
    tool,
    isPanning,
    setIsPanning,
    showGrid,
    showStickerPicker,
    setShowStickerPicker,
    showPhotoSidebar,
    setShowPhotoSidebar,
    isProcessingBg,
    setIsProcessingBg,
    getCanvasCenter,
    getSelectedElement,
    // Marquee selection
    isMarqueeSelecting,
    marqueeRect,
    startMarqueeSelect,
    updateMarqueeSelect,
    endMarqueeSelect,
  } = useCanvasStore();

  // AI Magic
  const { isOpen: isAiMagicOpen, openSidebar: openAiMagicSidebar } = useAiMagicStore();

  // Hooks
  useCanvasKeyboard();
  useCanvasAutoSave();
  const toolbarVisible = useToolbarVisibility();
  useFontLoader();

  // Load project on mount
  useEffect(() => {
    loadProject();
  }, [loadProject]);

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
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  // Update transformer on selection change
  useEffect(() => {
    if (!transformerRef.current || !stageRef.current) return;

    // 多选模式
    if (selectedIds.length > 0) {
      const nodes = selectedIds
        .map((id) => stageRef.current?.findOne(`#${id}`))
        .filter(Boolean) as Konva.Node[];
      transformerRef.current.nodes(nodes);
      return;
    }

    // 单选模式
    if (selectedId) {
      const node = stageRef.current.findOne(`#${selectedId}`);
      if (node) {
        transformerRef.current.nodes([node]);
      }
    } else {
      transformerRef.current.nodes([]);
    }
  }, [selectedId, selectedIds]);

  // ==================== Handlers ====================

  const handleWheel = useCallback(
    (e: Konva.KonvaEventObject<WheelEvent>) => {
      e.evt.preventDefault();
      const stage = stageRef.current;
      if (!stage) return;

      const pointer = stage.getPointerPosition();
      if (!pointer) return;

      const direction = e.evt.deltaY > 0 ? -1 : 1;
      zoomToPoint(pointer.x, pointer.y, stage.x(), stage.y(), direction as 1 | -1);
    },
    [zoomToPoint]
  );

  const handleMouseDown = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      // 开始拖拽画布时，关闭编辑状态
      if (tool === "pan" || e.evt.button === 1) {
        if (editingState) {
          stopEditing();
        }
        setIsPanning(true);
        setLastPointerPos({ x: e.evt.clientX, y: e.evt.clientY });
        return;
      }

      // 点击画布空白区域
      if (e.target === e.target.getStage()) {
        // 关闭编辑状态
        if (editingState) {
          stopEditing();
        }

        // Ctrl/Cmd+Click 保持现有选择，普通点击清除
        if (!e.evt.ctrlKey && !e.evt.metaKey) {
          clearSelection();
        }

        // 开始框选 - 使用画布坐标
        const stage = e.target.getStage();
        if (stage) {
          const pointer = stage.getPointerPosition();
          if (pointer) {
            // 转换为画布坐标
            const canvasX = (pointer.x - viewport.x) / viewport.zoom;
            const canvasY = (pointer.y - viewport.y) / viewport.zoom;
            startMarqueeSelect(canvasX, canvasY);
          }
        }
      }
    },
    [tool, setIsPanning, clearSelection, editingState, stopEditing, viewport, startMarqueeSelect]
  );

  const handleMouseMove = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      // 画布拖拽
      if (isPanning) {
        const dx = e.evt.clientX - lastPointerPos.x;
        const dy = e.evt.clientY - lastPointerPos.y;
        setViewport({ x: viewport.x + dx, y: viewport.y + dy });
        setLastPointerPos({ x: e.evt.clientX, y: e.evt.clientY });
        return;
      }

      // 框选中
      if (isMarqueeSelecting) {
        const stage = stageRef.current;
        if (stage) {
          const pointer = stage.getPointerPosition();
          if (pointer) {
            // 转换为画布坐标
            const canvasX = (pointer.x - viewport.x) / viewport.zoom;
            const canvasY = (pointer.y - viewport.y) / viewport.zoom;
            updateMarqueeSelect(canvasX, canvasY);
          }
        }
      }
    },
    [isPanning, isMarqueeSelecting, lastPointerPos, viewport, setViewport, updateMarqueeSelect]
  );

  const handleMouseUp = useCallback(() => {
    if (isPanning) {
      setIsPanning(false);
    }
    if (isMarqueeSelecting) {
      endMarqueeSelect();
    }
  }, [isPanning, setIsPanning, isMarqueeSelecting, endMarqueeSelect]);

  // ==================== Element Actions ====================

  const handleAddPhoto = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handlePhotoUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      // 文件大小限制：10MB
      const maxSizeBytes = 10 * 1024 * 1024;
      if (file.size > maxSizeBytes) {
        toast.error("图片文件太大", {
          description: `最大支持 10MB，当前文件 ${(file.size / 1024 / 1024).toFixed(1)}MB`,
        });
        e.target.value = "";
        return;
      }

      // 检查文件类型
      const validTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
      if (!validTypes.includes(file.type)) {
        toast.error("不支持的图片格式", {
          description: "请使用 JPG、PNG、GIF 或 WebP 格式",
        });
        e.target.value = "";
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const maxWidth = CANVAS_CONFIG.MAX_IMAGE_WIDTH;
          const scale = img.width > maxWidth ? maxWidth / img.width : 1;
          const center = getCanvasCenter(stageSize.width, stageSize.height);

          addElement({
            id: `image-${Date.now()}`,
            type: "image",
            x: center.x - (img.width * scale) / 2,
            y: center.y - (img.height * scale) / 2,
            src: event.target?.result as string,
            width: img.width * scale,
            height: img.height * scale,
          });
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
      e.target.value = "";
    },
    [addElement, getCanvasCenter, stageSize]
  );

  const handleAddText = useCallback(() => {
    const center = getCanvasCenter(stageSize.width, stageSize.height);
    const stage = stageRef.current;
    const zoom = viewport.zoom;

    const newElement = {
      id: `text-${Date.now()}`,
      type: "text" as const,
      x: center.x - 100,
      y: center.y - 20,
      text: "",
      html: "",
      fontSize: 24,
      fontFamily: "ZCOOL XiaoWei",
      fill: "#333333",
      width: 200,
      height: 40,
    };

    addElement(newElement);

    // 延迟后自动进入编辑状态（等待元素渲染）
    setTimeout(() => {
      if (stage) {
        const stageBox = stage.container().getBoundingClientRect();
        const screenX = stageBox.left + (newElement.x * zoom + viewport.x);
        const screenY = stageBox.top + (newElement.y * zoom + viewport.y);

        startEditing({
          id: newElement.id,
          initialHtml: "",
          x: screenX,
          y: screenY,
          width: Math.max(150, newElement.width * zoom),
          height: Math.max(30, newElement.height * zoom),
          zoom: zoom,
          style: {
            fontSize: newElement.fontSize,
            fontFamily: newElement.fontFamily,
            fill: newElement.fill,
          },
        });
      }
    }, 50);
  }, [addElement, getCanvasCenter, stageSize, viewport, startEditing]);

  const handleAddSticker = useCallback(
    (emoji: string) => {
      const center = getCanvasCenter(stageSize.width, stageSize.height);
      addElement({
        id: `sticker-${Date.now()}`,
        type: "sticker",
        x: center.x - 50,
        y: center.y - 50,
        text: emoji,
        fontSize: 80,
        fontFamily: "Arial",
        fill: "#000000",
        width: 100,
        height: 100,
      });
      setShowStickerPicker(false);
    },
    [addElement, getCanvasCenter, stageSize, setShowStickerPicker]
  );

  const handlePhotoFromSidebar = useCallback(
    (photoUrl: string, width: number, height: number) => {
      const center = getCanvasCenter(stageSize.width, stageSize.height);
      addElement({
        id: `gallery-${Date.now()}`,
        type: "image",
        x: center.x - width / 2,
        y: center.y - height / 2,
        width,
        height,
        src: photoUrl,
      });
    },
    [addElement, getCanvasCenter, stageSize]
  );

  const handleTextDblClick = useCallback(
    (element: CanvasElement) => {
      const stage = stageRef.current;
      if (!stage) return;

      const stageBox = stage.container().getBoundingClientRect();
      const zoom = viewport.zoom;

      // 计算元素在屏幕上的位置（考虑 viewport 偏移和缩放）
      const screenX = stageBox.left + (element.x * zoom + viewport.x);
      const screenY = stageBox.top + (element.y * zoom + viewport.y);
      const screenWidth = Math.max(150, (element.width || 200) * zoom);
      const screenHeight = Math.max(30, (element.height || 50) * zoom);

      const state: TextEditingState = {
        id: element.id,
        initialHtml: element.html || element.text || "",
        x: screenX,
        y: screenY,
        width: screenWidth,
        height: screenHeight,
        zoom: zoom,
        style: {
          fontSize: element.fontSize || 24,
          fontFamily: element.fontFamily || "Arial",
          fill: element.fill || "#333333",
        },
      };
      startEditing(state);
    },
    [startEditing, viewport]
  );

  const handleEditorChange = useCallback(
    (html: string) => {
      if (!editingState) return;

      // 将 HTML 转换为纯文本，保留换行
      const htmlToText = (htmlContent: string): string => {
        return htmlContent
          .replace(/<br\s*\/?>/gi, "\n")           // <br> -> 换行
          .replace(/<\/div><div>/gi, "\n")          // </div><div> -> 换行
          .replace(/<\/p><p>/gi, "\n")              // </p><p> -> 换行
          .replace(/<div>/gi, "")                   // 移除开始 div
          .replace(/<\/div>/gi, "\n")               // </div> -> 换行
          .replace(/<p>/gi, "")                     // 移除开始 p
          .replace(/<\/p>/gi, "\n")                 // </p> -> 换行
          .replace(/<[^>]*>/g, "")                  // 移除其他 HTML 标签
          .replace(/&nbsp;/g, " ")                  // &nbsp; -> 空格
          .replace(/\n+/g, "\n")                    // 合并多个换行
          .trim();
      };

      const text = htmlToText(html);
      updateElement(editingState.id, { html, text });
    },
    [editingState, updateElement]
  );

  const handleRemoveBackground = useCallback(async () => {
    const element = getSelectedElement();
    if (!element || element.type !== "image" || !element.src) return;

    setIsProcessingBg(true);
    toast.info("Removing background...");

    try {
      let imageSource: string | Blob = element.src;
      if (!element.src.startsWith("blob:") && !element.src.startsWith("data:")) {
        const response = await fetch(element.src);
        if (!response.ok) throw new Error("Failed to fetch image");
        imageSource = await response.blob();
      }

      const blob = await imglyRemoveBackground(imageSource);
      const url = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("Failed to convert image"));
        reader.readAsDataURL(blob);
      });

      updateElement(element.id, { src: url });
      toast.success("Background removed!");
    } catch (error) {
      console.error("Background removal error:", error);
      toast.error("Failed to remove background.");
    } finally {
      setIsProcessingBg(false);
    }
  }, [getSelectedElement, updateElement, setIsProcessingBg]);

  const handleInsertFromAiMagic = useCallback(
    (imageDataUrl: string) => {
      const img = new Image();
      img.onload = () => {
        const maxWidth = CANVAS_CONFIG.MAX_IMAGE_WIDTH;
        const scale = img.width > maxWidth ? maxWidth / img.width : 1;
        const center = getCanvasCenter(stageSize.width, stageSize.height);

        addElement({
          id: `ai-magic-${Date.now()}`,
          type: "image",
          x: center.x - (img.width * scale) / 2,
          y: center.y - (img.height * scale) / 2,
          width: img.width * scale,
          height: img.height * scale,
          src: imageDataUrl,
        });
        toast.success("AI generated image added!");
      };
      img.src = imageDataUrl;
    },
    [addElement, getCanvasCenter, stageSize]
  );

  // ==================== Render ====================

  if (isLoading) {
    return <CanvasLoading />;
  }

  const selectedElement = getSelectedElement();

  return (
    <CanvasErrorBoundary>
      <div
        className="fixed inset-0 overflow-hidden canvas-paper-bg"
        ref={containerRef}
      >
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handlePhotoUpload}
          className="hidden"
        />

        {/* Text Editor Overlay */}
        {editingState && (
          <HtmlTextEditor
            editingState={editingState}
            onChange={handleEditorChange}
            onBlur={stopEditing}
          />
        )}

        {/* Toolbars */}
        <CanvasTopToolbar
          onAddPhoto={handleAddPhoto}
          onAddText={handleAddText}
          onToggleStickerPicker={() => setShowStickerPicker(!showStickerPicker)}
          onOpenAiMagic={openAiMagicSidebar}
          visible={toolbarVisible}
        />

        <TextPropertiesToolbar selectedElement={selectedElement || null} visible={toolbarVisible} />

        <LayerToolbar
          selectedElement={selectedElement || null}
          onRemoveBackground={handleRemoveBackground}
          onMagicEdit={() => setShowSpotlight(true)}
          visible={toolbarVisible}
        />

        <ZoomControls visible={toolbarVisible} />
        <CanvasHints visible={toolbarVisible} />

        {/* Sticker Picker */}
        {showStickerPicker && (
          <StickerPicker onSelect={handleAddSticker} onClose={() => setShowStickerPicker(false)} />
        )}

        {/* AI Spotlight */}
        {showSpotlight && (
          <AiSpotlight
            selectedImage={selectedElement?.type === "image" ? selectedElement.src : null}
            onGenerate={(src) => {
              const center = getCanvasCenter(stageSize.width, stageSize.height);
              addElement({
                id: `ai-${Date.now()}`,
                type: "image",
                x: center.x - 150,
                y: center.y - 150,
                width: 300,
                height: 300,
                src,
              });
              setShowSpotlight(false);
            }}
            onEdit={(newSrc) => {
              if (selectedId) {
                updateElement(selectedId, { src: newSrc });
              }
              setShowSpotlight(false);
            }}
            onClose={() => setShowSpotlight(false)}
          />
        )}

        {/* AI Magic Sidebar */}
        <AiMagicSidebar onInsertImage={handleInsertFromAiMagic} />

        {/* Photo Gallery Sidebar */}
        <CanvasPhotoSidebar
          isOpen={showPhotoSidebar}
          onToggle={setShowPhotoSidebar}
          onPhotoSelect={handlePhotoFromSidebar}
        />

        {/* Empty State */}
        {elements.length === 0 && (
          <CanvasEmptyState
            onAddPhoto={handleAddPhoto}
            onAddText={handleAddText}
            onAddSticker={() => setShowStickerPicker(true)}
            onOpenAiMagic={openAiMagicSidebar}
          />
        )}

        {/* Canvas Stage */}
        <Stage
          ref={stageRef}
          width={stageSize.width}
          height={stageSize.height}
          x={viewport.x}
          y={viewport.y}
          scaleX={viewport.zoom}
          scaleY={viewport.zoom}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          style={{ cursor: tool === "pan" || isPanning ? "grab" : "default" }}
        >
          <Layer>
            {/* Grid */}
            {showGrid && (
              <CanvasGrid viewport={viewport} stageWidth={stageSize.width} stageHeight={stageSize.height} />
            )}

            {/* Elements */}
            {elements.map((el) => {
              if (el.type === "text" || el.type === "sticker") {
                if (editingState?.id === el.id) return null;
                return (
                  <CanvasRichText
                    key={el.id}
                    element={el}
                    isSelected={selectedId === el.id}
                    onSelect={() => setSelectedId(el.id)}
                    onDblClick={() => handleTextDblClick(el)}
                    onUpdate={updateElement}
                  />
                );
              }
              if (el.type === "image") {
                return (
                  <CanvasImageElement
                    key={el.id}
                    element={el}
                    isSelected={selectedId === el.id}
                    onSelect={() => setSelectedId(el.id)}
                    onUpdate={updateElement}
                  />
                );
              }
              return null;
            })}

            {/* Selection Marquee */}
            {isMarqueeSelecting && marqueeRect && (
              <SelectionRect rect={marqueeRect} />
            )}

            {/* Transformer */}
            <Transformer
              ref={transformerRef}
              boundBoxFunc={(oldBox, newBox) => {
                if (newBox.width < 5 || newBox.height < 5) return oldBox;
                return newBox;
              }}
            />
          </Layer>
        </Stage>
      </div>
    </CanvasErrorBoundary>
  );
}
