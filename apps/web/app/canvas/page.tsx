/**
 * Immersive Journal with Pages - Supabase Storage
 *
 * 画布数据存储在 Supabase Database
 * 图片存储在 Supabase Storage
 */

'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Stage, Layer, Rect, Line, Text, Image as KonvaImage, Transformer } from 'react-konva';
import { Image as ImageIcon, Type, ChevronLeft, ChevronRight, Grid3x3, X, Palette, Type as TypeIcon, Bold, Italic, Underline, ArrowUp, ArrowDown, Layers, BringToFront, SendToBack, Smile, Sparkles, Scissors, Loader2, Wand2, Cloud, CloudOff, Save } from 'lucide-react';
import Konva from 'konva';
import useImage from 'use-image';
import { removeBackground as imglyRemoveBackground } from "@imgly/background-removal";
import { toast } from 'sonner';
import { loadFont } from '@/lib/canvas/font-loader';
import { StickerPicker } from '@/components/canvas/sticker-picker';
import { AiSpotlight } from '@/components/canvas/ai-spotlight';
import { AiMagicSidebar } from '@/components/canvas/ai-magic-sidebar';
import { useAiMagicStore } from '@/lib/canvas/ai-magic-store';
import type { CanvasProject, CanvasPageData, CanvasPageElement } from '@/types/storage';

const PAGE_WIDTH = 840;
const PAGE_HEIGHT = 1190;

// Curated list of handwriting/journal fonts
const JOURNAL_FONTS = [
    'Arial',
    'Kavivanar',
    'Handlee',
    'Patrick Hand',
    'Caveat',
    'Indie Flower',
    'Shadows Into Light'
];

// 使用 types/storage.ts 中定义的类型
type PageElement = CanvasPageElement;
type PageData = CanvasPageData;

// Helper to create SVG data URL from HTML
const createTextSVG = (html: string, width: number, height: number, style: any) => {
    const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <foreignObject width="100%" height="100%">
        <div xmlns="http://www.w3.org/1999/xhtml" style="font-size: ${style.fontSize}px; font-family: '${style.fontFamily}'; color: ${style.fill}; line-height: 1.2; overflow: visible; word-wrap: break-word;">
          ${html}
        </div>
      </foreignObject>
    </svg>`;
    return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
};

// Rich Text Component using SVG Image
function CanvasRichText({ element, isSelected, onSelect, onUpdate, onDblClick }: any) {
    const [image, setImage] = useState<HTMLImageElement | null>(null);

    useEffect(() => {
        const img = new Image();
        img.onload = () => setImage(img);
        // Use a default width if not set, or estimate based on content length
        const w = element.width || 300;
        const h = element.height || 100;
        img.src = createTextSVG(element.html || element.text, w, h, {
            fontSize: element.fontSize,
            fontFamily: element.fontFamily,
            fill: element.fill
        });
    }, [element.text, element.html, element.fontSize, element.fontFamily, element.fill, element.width, element.height]);

    return (
        <KonvaImage
            id={element.id}
            image={image || undefined}
            x={element.x}
            y={element.y}
            width={element.width || 300}
            height={element.height || 100}
            draggable={element.draggable}
            onClick={onSelect}
            onTap={onSelect}
            onDblClick={onDblClick}
            onDblTap={onDblClick}
            onDragEnd={(e) => {
                onUpdate(element.id, {
                    x: e.target.x(),
                    y: e.target.y(),
                });
            }}
            onTransformEnd={(e) => {
                const node = e.target;
                const scaleX = node.scaleX();
                const scaleY = node.scaleY();

                onUpdate(element.id, {
                    x: node.x(),
                    y: node.y(),
                    width: Math.max(50, node.width() * scaleX),
                    height: Math.max(20, node.height() * scaleY),
                });

                node.scaleX(1);
                node.scaleY(1);
            }}
        />
    );
}

// Image component with useImage hook
function CanvasImage({ element, isSelected, onSelect, onUpdate }: any) {
    const [image] = useImage(element.src);

    return (
        <KonvaImage
            id={element.id}
            image={image}
            x={element.x}
            y={element.y}
            width={element.width}
            height={element.height}
            draggable={element.draggable}
            onClick={onSelect}
            onTap={onSelect}
            onDragEnd={(e) => {
                onUpdate(element.id, {
                    x: e.target.x(),
                    y: e.target.y(),
                });
            }}
            onTransformEnd={(e) => {
                const node = e.target;
                const scaleX = node.scaleX();
                const scaleY = node.scaleY();

                onUpdate(element.id, {
                    x: node.x(),
                    y: node.y(),
                    width: Math.max(5, node.width() * scaleX),
                    height: Math.max(5, node.height() * scaleY),
                });

                node.scaleX(1);
                node.scaleY(1);
            }}
        />
    );
}

// Isolated Editor Component to prevent re-render cursor jumps
const HtmlTextEditor = ({
    id,
    initialHtml,
    x,
    y,
    width,
    height,
    style,
    onChange,
    onBlur
}: any) => {
    const editorRef = useRef<HTMLDivElement>(null);
    const [toolbarPosition, setToolbarPosition] = useState({ top: 0, left: 0 });

    // Initialize content once on mount
    useEffect(() => {
        if (editorRef.current) {
            editorRef.current.innerHTML = initialHtml;
            editorRef.current.focus();
        }
    }, []); // Empty dependency array = run once on mount

    // Update toolbar position based on selection
    const updateToolbar = () => {
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0 && !selection.isCollapsed) {
            const range = selection.getRangeAt(0);
            const rect = range.getBoundingClientRect();
            setToolbarPosition({
                top: rect.top - 40,
                left: rect.left
            });
        }
    };

    const handleInput = (e: React.FormEvent<HTMLDivElement>) => {
        const newHtml = e.currentTarget.innerHTML;
        onChange(newHtml);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') {
            onBlur();
        }
    };

    const execCommand = (command: string, value: string | undefined = undefined) => {
        document.execCommand(command, false, value);
        if (editorRef.current) {
            onChange(editorRef.current.innerHTML);
        }
    };

    return (
        <>
            {/* Contextual Formatting Toolbar */}
            <div
                className="fixed z-[60] bg-white shadow-xl rounded-lg border border-gray-200 flex items-center gap-1 p-1 transition-opacity duration-200"
                style={{
                    top: y - 45, // Position above the editor
                    left: x,
                    opacity: 1
                }}
                onMouseDown={(e) => e.preventDefault()} // Prevent losing focus
            >
                <button onClick={() => execCommand('bold')} className="p-1.5 hover:bg-gray-100 rounded" title="Bold">
                    <Bold className="w-4 h-4" />
                </button>
                <button onClick={() => execCommand('italic')} className="p-1.5 hover:bg-gray-100 rounded" title="Italic">
                    <Italic className="w-4 h-4" />
                </button>
                <button onClick={() => execCommand('underline')} className="p-1.5 hover:bg-gray-100 rounded" title="Underline">
                    <Underline className="w-4 h-4" />
                </button>
            </div>

            <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                onInput={handleInput}
                onBlur={onBlur}
                onKeyDown={handleKeyDown}
                onMouseUp={updateToolbar}
                onKeyUp={updateToolbar}
                className="fixed z-50 outline-none p-1 overflow-visible"
                style={{
                    left: x,
                    top: y,
                    width: width,
                    minHeight: height,
                    fontSize: style.fontSize,
                    fontFamily: style.fontFamily,
                    color: style.fill,
                    lineHeight: '1.2',
                    wordWrap: 'break-word',
                    textAlign: 'left',
                    background: 'transparent', // Transparent background to blend in
                }}
            />
        </>
    );
};

export default function ImmersiveJournalPage() {
    const stageRef = useRef<Konva.Stage>(null);
    const transformerRef = useRef<Konva.Transformer>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const editorRef = useRef<HTMLDivElement>(null);
    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // AI Magic Sidebar
    const { isOpen: isAiMagicOpen, openSidebar: openAiMagicSidebar } = useAiMagicStore();

    // Project state
    const [projectId, setProjectId] = useState<string | null>(null);
    const [projectTitle, setProjectTitle] = useState('My Journal');
    const [currentPage, setCurrentPage] = useState(1);
    const [pages, setPages] = useState<PageData[]>([
        { id: 1, background: '#ffffff', elements: [] },
        { id: 2, background: '#ffffff', elements: [] },
        { id: 3, background: '#ffffff', elements: [] },
    ]);

    // Loading/saving state
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');
    const [lastSaved, setLastSaved] = useState<Date | null>(null);

    const [showGrid, setShowGrid] = useState(true);
    const [showToolbar, setShowToolbar] = useState(true);
    const [showStickerPicker, setShowStickerPicker] = useState(false);
    const [showSpotlight, setShowSpotlight] = useState(false);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [isProcessingBg, setIsProcessingBg] = useState(false);

    // Store editing state: id, initial content, and position/style info
    const [editingState, setEditingState] = useState<{
        id: string;
        initialHtml: string;
        x: number;
        y: number;
        width: number;
        height: number;
        style: {
            fontSize: number;
            fontFamily: string;
            fill: string;
        }
    } | null>(null);

    const [loadedFonts, setLoadedFonts] = useState<Record<string, boolean>>({ 'Arial': true });

    // Save to Supabase (debounced)
    const saveToServer = useCallback(async (pagesData: PageData[], currentPageNum: number) => {
        if (!projectId) return;

        setSaveStatus('saving');
        setIsSaving(true);

        try {
            const response = await fetch(`/api/canvas/${projectId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    currentPage: currentPageNum,
                    pages: pagesData,
                }),
            });

            if (!response.ok) {
                throw new Error('Failed to save');
            }

            setSaveStatus('saved');
            setLastSaved(new Date());
        } catch (error) {
            console.error('Save error:', error);
            setSaveStatus('error');
            toast.error('Failed to save. Will retry...');
        } finally {
            setIsSaving(false);
        }
    }, [projectId]);

    // Debounced save
    const debouncedSave = useCallback((pagesData: PageData[], currentPageNum: number) => {
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
        }

        setSaveStatus('saving');

        saveTimeoutRef.current = setTimeout(() => {
            saveToServer(pagesData, currentPageNum);
        }, 1500); // 1.5 second debounce
    }, [saveToServer]);

    // Load project from Supabase on mount
    useEffect(() => {
        const loadProject = async () => {
            setIsLoading(true);

            try {
                const response = await fetch('/api/canvas/default');
                if (!response.ok) {
                    throw new Error('Failed to load project');
                }

                const data = await response.json();
                const project: CanvasProject = data.project;

                setProjectId(project.id);
                setProjectTitle(project.title);
                setCurrentPage(project.currentPage);
                setPages(project.pages);
                setLastSaved(new Date(project.updatedAt));
                setSaveStatus('saved');
            } catch (error) {
                console.error('Load error:', error);
                toast.error('Failed to load project. Using local data.');

                // Fallback to localStorage
                const saved = localStorage.getItem('journal-pages');
                if (saved) {
                    try {
                        const parsed = JSON.parse(saved);
                        setPages(parsed.pages || pages);
                        setCurrentPage(parsed.currentPage || 1);
                    } catch (e) {
                        console.error('Failed to load local data:', e);
                    }
                }
            } finally {
                setIsLoading(false);
            }
        };

        loadProject();
    }, []);

    // Auto-save whenever pages change
    useEffect(() => {
        if (isLoading || !projectId) return;

        // Also save to localStorage as backup
        const saveData = {
            pages,
            currentPage,
            lastSaved: new Date().toISOString(),
        };
        localStorage.setItem('journal-pages', JSON.stringify(saveData));

        // Debounced save to server
        debouncedSave(pages, currentPage);

        return () => {
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
            }
        };
    }, [pages, currentPage, isLoading, projectId, debouncedSave]);

    const currentPageData = pages.find(p => p.id === currentPage) || pages[0];

    // Auto-hide toolbar
    useEffect(() => {
        let timeout: NodeJS.Timeout;
        const handleMouseMove = () => {
            setShowToolbar(true);
            clearTimeout(timeout);
            timeout = setTimeout(() => setShowToolbar(false), 3000);
        };
        window.addEventListener('mousemove', handleMouseMove);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            clearTimeout(timeout);
        };
    }, []);

    // Update transformer
    useEffect(() => {
        if (transformerRef.current && stageRef.current && selectedId) {
            const node = stageRef.current.findOne(`#${selectedId}`);
            if (node) {
                transformerRef.current.nodes([node]);
            }
        } else if (transformerRef.current) {
            transformerRef.current.nodes([]);
        }
    }, [selectedId]);

    // Handle deletion
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.key === 'Backspace' || e.key === 'Delete') && selectedId && !editingState) {
                const updatedPages = pages.map(p =>
                    p.id === currentPage
                        ? { ...p, elements: p.elements.filter(el => el.id !== selectedId) }
                        : p
                );
                setPages(updatedPages);
                setSelectedId(null);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedId, editingState, pages, currentPage]);

    // Preload fonts
    useEffect(() => {
        JOURNAL_FONTS.forEach(font => {
            if (font !== 'Arial') {
                loadFont(font).then(() => {
                    setLoadedFonts(prev => ({ ...prev, [font]: true }));
                });
            }
        });
    }, []);

    // Add photo
    const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                const maxWidth = 400;
                const scale = maxWidth / img.width;
                const newImage = {
                    id: `image-${Date.now()}`,
                    type: 'image' as const,
                    x: PAGE_WIDTH / 2 - (img.width * scale) / 2,
                    y: PAGE_HEIGHT / 2 - (img.height * scale) / 2,
                    src: event.target?.result as string,
                    width: img.width * scale,
                    height: img.height * scale,
                    draggable: true,
                };

                const updatedPages = pages.map(p =>
                    p.id === currentPage
                        ? { ...p, elements: [...p.elements, newImage] }
                        : p
                );
                setPages(updatedPages);
                setSelectedId(newImage.id);
            };
            img.src = event.target?.result as string;
        };
        reader.readAsDataURL(file);

        // Reset input
        e.target.value = '';
    };

    // Add text
    const addText = () => {
        const newText = {
            id: `text-${Date.now()}`,
            type: 'text' as const,
            x: PAGE_WIDTH / 2 - 150,
            y: PAGE_HEIGHT / 2 - 25,
            text: 'Double click to edit',
            html: 'Double click to edit',
            fontSize: 24,
            fontFamily: 'Kavivanar', // Default to a nice journal font
            fill: '#333333',
            width: 300,
            height: 100,
            draggable: true,
        };

        const updatedPages = pages.map(p =>
            p.id === currentPage
                ? { ...p, elements: [...p.elements, newText] }
                : p
        );
        setPages(updatedPages);
        setSelectedId(newText.id);
    };



    // Add sticker
    const addSticker = (emoji: string) => {
        const newSticker: PageElement = {
            id: `sticker-${Date.now()}`,
            type: 'text',
            x: PAGE_WIDTH / 2 - 50,
            y: PAGE_HEIGHT / 2 - 50,
            text: emoji,
            fontSize: 80,
            fontFamily: 'Arial',
            fill: '#000000',
            width: 100,
            height: 100,
            draggable: true,
        };

        const updatedPages = pages.map(p =>
            p.id === currentPage
                ? { ...p, elements: [...p.elements, newSticker] }
                : p
        );
        setPages(updatedPages);
        setSelectedId(newSticker.id);
        setShowStickerPicker(false);
    };

    // Add AI Image
    const addAiImage = (dataUrl: string) => {
        const newImage: PageElement = {
            id: `ai-image-${Date.now()}`,
            type: 'image',
            x: PAGE_WIDTH / 2 - 150,
            y: PAGE_HEIGHT / 2 - 150,
            width: 300,
            height: 300,
            src: dataUrl,
            draggable: true,
        };

        const updatedPages = pages.map(p =>
            p.id === currentPage
                ? { ...p, elements: [...p.elements, newImage] }
                : p
        );
        setPages(updatedPages);
        setSelectedId(newImage.id);
        setShowSpotlight(false);
    };

    // Handle insert from AI Magic Sidebar
    const handleInsertFromAiMagic = (imageDataUrl: string) => {
        // Create a temporary image to get dimensions
        const img = new Image();
        img.onload = () => {
            const maxWidth = 400;
            const scale = img.width > maxWidth ? maxWidth / img.width : 1;

            const newImage: PageElement = {
                id: `ai-magic-${Date.now()}`,
                type: 'image',
                x: PAGE_WIDTH / 2 - (img.width * scale) / 2,
                y: PAGE_HEIGHT / 2 - (img.height * scale) / 2,
                width: img.width * scale,
                height: img.height * scale,
                src: imageDataUrl,
                draggable: true,
            };

            const updatedPages = pages.map(p =>
                p.id === currentPage
                    ? { ...p, elements: [...p.elements, newImage] }
                    : p
            );
            setPages(updatedPages);
            setSelectedId(newImage.id);
            toast.success("AI generated image added to canvas!");
        };
        img.src = imageDataUrl;
    };

    // Remove Background
    const removeBackground = async (id: string) => {
        const page = pages.find(p => p.id === currentPage);
        if (!page) return;

        const element = page.elements.find(el => el.id === id);
        if (!element || element.type !== 'image' || !element.src) return;

        // 保存旧的 blob URL 以便稍后释放
        const oldSrc = element.src;

        setIsProcessingBg(true);
        toast.info("Removing background... This may take a moment.");

        try {
            const blob = await imglyRemoveBackground(element.src);
            const url = URL.createObjectURL(blob);

            // 释放旧的 blob URL 以避免内存泄漏
            if (oldSrc && oldSrc.startsWith('blob:')) {
                URL.revokeObjectURL(oldSrc);
            }

            // Update element with new image
            const updatedPages = pages.map(p =>
                p.id === currentPage
                    ? {
                        ...p,
                        elements: p.elements.map(el =>
                            el.id === id ? { ...el, src: url } : el
                        )
                    }
                    : p
            );
            setPages(updatedPages);
            toast.success("Background removed successfully!");
        } catch (error) {
            console.error("Background removal error:", error);
            toast.error("Failed to remove background.");
        } finally {
            setIsProcessingBg(false);
        }
    };

    // Apply Magic Edit
    const applyMagicEdit = (newImageSrc: string) => {
        if (!selectedId) return;

        const updatedPages = pages.map(p =>
            p.id === currentPage
                ? {
                    ...p,
                    elements: p.elements.map(el =>
                        el.id === selectedId ? { ...el, src: newImageSrc } : el
                    )
                }
                : p
        );
        setPages(updatedPages);
        setShowSpotlight(false);
        toast.success("Magic edit applied!");
    };

    // Update background
    const updateBackground = (color: string) => {
        const updatedPages = pages.map(p =>
            p.id === currentPage
                ? { ...p, background: color }
                : p
        );
        setPages(updatedPages);
    };

    // Handle text double click
    const handleTextDblClick = (element: any) => {
        const textNode = stageRef.current?.findOne(`#${element.id}`);
        if (!textNode) return;

        // Calculate position
        const textPosition = textNode.absolutePosition();
        const stageBox = stageRef.current?.container().getBoundingClientRect();

        if (!stageBox) return;

        const absX = stageBox.left + textPosition.x;
        const absY = stageBox.top + textPosition.y;

        setEditingState({
            id: element.id,
            initialHtml: element.html || element.text,
            x: absX,
            y: absY,
            width: Math.max(200, element.width || 200),
            height: Math.max(50, element.height || 50),
            style: {
                fontSize: element.fontSize,
                fontFamily: element.fontFamily,
                fill: element.fill
            }
        });
    };

    // Handle text input change from editor
    const handleEditorChange = (html: string) => {
        if (!editingState) return;

        // Update the text node in real-time
        // Note: This causes re-render of the page, but HtmlTextEditor is isolated
        const updatedPages = pages.map(p =>
            p.id === currentPage
                ? {
                    ...p,
                    elements: p.elements.map(el =>
                        el.id === editingState.id
                            ? { ...el, html, text: stripHtml(html) } // Store both HTML and plain text
                            : el
                    ),
                }
                : p
        );
        setPages(updatedPages);
    };

    // Helper to strip HTML for plain text fallback
    const stripHtml = (html: string) => {
        const tmp = document.createElement('DIV');
        tmp.innerHTML = html;
        return tmp.textContent || tmp.innerText || '';
    };

    // Finish text editing
    const finishTextEdit = () => {
        setEditingState(null);
    };

    // Update element
    const updateElement = (id: string, updates: any) => {
        const updatedPages = pages.map(p =>
            p.id === currentPage
                ? {
                    ...p,
                    elements: p.elements.map(el =>
                        el.id === id ? { ...el, ...updates } : el
                    ),
                }
                : p
        );
        setPages(updatedPages);
    };

    // Move layer
    const moveLayer = (id: string, direction: 'up' | 'down' | 'top' | 'bottom') => {
        const page = pages.find(p => p.id === currentPage);
        if (!page) return;

        const index = page.elements.findIndex(el => el.id === id);
        if (index === -1) return;

        const newElements = [...page.elements];
        const element = newElements[index];

        newElements.splice(index, 1);

        if (direction === 'top') {
            newElements.push(element);
        } else if (direction === 'bottom') {
            newElements.unshift(element);
        } else if (direction === 'up') {
            newElements.splice(Math.min(index + 1, newElements.length), 0, element);
        } else if (direction === 'down') {
            newElements.splice(Math.max(index - 1, 0), 0, element);
        }

        const updatedPages = pages.map(p =>
            p.id === currentPage
                ? { ...p, elements: newElements }
                : p
        );
        setPages(updatedPages);
    };

    const renderGrid = () => {
        if (!showGrid) return null;
        const gridSize = 40;
        const lines = [];

        for (let i = 0; i <= PAGE_WIDTH / gridSize; i++) {
            lines.push(
                <Line
                    key={`v-${i}`}
                    points={[i * gridSize, 0, i * gridSize, PAGE_HEIGHT]}
                    stroke="#e5e7eb"
                    strokeWidth={1}
                    dash={[4, 4]}
                    listening={false}
                />
            );
        }

        for (let i = 0; i <= PAGE_HEIGHT / gridSize; i++) {
            lines.push(
                <Line
                    key={`h-${i}`}
                    points={[0, i * gridSize, PAGE_WIDTH, i * gridSize]}
                    stroke="#e5e7eb"
                    strokeWidth={1}
                    dash={[4, 4]}
                    listening={false}
                />
            );
        }

        return lines;
    };

    // Get selected element
    const selectedElement = currentPageData.elements.find(el => el.id === selectedId);

    // Loading state
    if (isLoading) {
        return (
            <div className="fixed inset-0 bg-gray-900 flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="w-12 h-12 animate-spin text-white" />
                    <p className="text-white text-lg">Loading your journal...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-gray-900 overflow-hidden flex items-center justify-center">
            {/* Hidden file input for photo upload */}
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handlePhotoUpload}
                className="hidden"
            />

            {/* Rich Text Editor Overlay */}
            {editingState && (
                <HtmlTextEditor
                    id={editingState.id}
                    initialHtml={editingState.initialHtml}
                    x={editingState.x}
                    y={editingState.y}
                    width={editingState.width}
                    height={editingState.height}
                    style={editingState.style}
                    onChange={handleEditorChange}
                    onBlur={finishTextEdit}
                />
            )}

            {/* Floating Toolbar */}
            <div
                className={`fixed top-6 left-1/2 -translate-x-1/2 z-50 transition-all duration-300 ${showToolbar ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4 pointer-events-none'
                    }`}
            >
                <div className="bg-white/95 backdrop-blur-lg rounded-full shadow-2xl px-6 py-3 flex items-center gap-4 border border-gray-200">
                    {/* Cloud save status indicator */}
                    <div className="flex items-center gap-2 text-xs">
                        {saveStatus === 'saving' ? (
                            <>
                                <Loader2 className="w-3 h-3 animate-spin text-blue-500" />
                                <span className="text-blue-600">Saving...</span>
                            </>
                        ) : saveStatus === 'error' ? (
                            <>
                                <CloudOff className="w-3 h-3 text-red-500" />
                                <span className="text-red-600">Save failed</span>
                            </>
                        ) : (
                            <>
                                <Cloud className="w-3 h-3 text-green-500" />
                                <span className="text-green-600">Saved to cloud</span>
                            </>
                        )}
                    </div>

                    <div className="w-px h-6 bg-gray-300" />

                    <button
                        onClick={() => setShowGrid(!showGrid)}
                        className={`p-2 rounded-lg transition-colors ${showGrid ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-100'
                            }`}
                        title="Toggle Grid"
                    >
                        <Grid3x3 className="w-5 h-5" />
                    </button>

                    <div className="w-px h-6 bg-gray-300" />

                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="px-4 py-2 bg-white hover:bg-gray-50 rounded-lg flex items-center gap-2 transition-colors border border-gray-200"
                    >
                        <ImageIcon className="w-4 h-4" />
                        <span className="text-sm font-medium">Photo</span>
                    </button>

                    <div className="relative group">
                        <button className="px-4 py-2 bg-white hover:bg-gray-50 rounded-lg flex items-center gap-2 transition-colors border border-gray-200">
                            <Palette className="w-4 h-4" />
                            <span className="text-sm font-medium">Bg</span>
                        </button>
                        <input
                            type="color"
                            value={currentPageData.background || '#ffffff'}
                            onChange={(e) => updateBackground(e.target.value)}
                            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                            title="Change Background Color"
                        />
                    </div>

                    <button
                        onClick={() => setShowStickerPicker(!showStickerPicker)}
                        className={`px-4 py-2 hover:bg-gray-50 rounded-lg flex items-center gap-2 transition-colors border border-gray-200 ${showStickerPicker ? 'bg-blue-50 border-blue-200 text-blue-600' : 'bg-white'}`}
                    >
                        <Smile className="w-4 h-4" />
                        <span className="text-sm font-medium">Sticker</span>
                    </button>

                    <button
                        onClick={openAiMagicSidebar}
                        className={`px-4 py-2 hover:bg-gray-50 rounded-lg flex items-center gap-2 transition-colors border border-gray-200 ${isAiMagicOpen ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'bg-white'}`}
                    >
                        <Sparkles className="w-4 h-4" />
                        <span className="text-sm font-medium">AI Magic</span>
                    </button>

                    <button
                        onClick={addText}
                        className="px-4 py-2 bg-white hover:bg-gray-50 rounded-lg flex items-center gap-2 transition-colors border border-gray-200"
                    >
                        <Type className="w-4 h-4" />
                        <span className="text-sm font-medium">Text</span>
                    </button>

                    <div className="w-px h-6 bg-gray-300" />

                    <button
                        onClick={() => window.history.back()}
                        className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>
            </div>

            {/* Sticker Picker */}
            {showStickerPicker && (
                <StickerPicker
                    onSelect={addSticker}
                    onClose={() => setShowStickerPicker(false)}
                />
            )}

            {/* AI Spotlight (Legacy - kept for quick edits) */}
            {showSpotlight && (
                <AiSpotlight
                    selectedImage={selectedElement?.type === 'image' ? selectedElement.src : null}
                    onGenerate={addAiImage}
                    onEdit={applyMagicEdit}
                    onClose={() => setShowSpotlight(false)}
                />
            )}

            {/* AI Magic Sidebar */}
            <AiMagicSidebar onInsertImage={handleInsertFromAiMagic} />

            {/* Layer Control Toolbar - Shows when any element is selected */}
            {selectedId && !editingState && (
                <div
                    className={`fixed top-24 right-8 z-50 transition-all duration-300 ${showToolbar ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4 pointer-events-none'
                        }`}
                >
                    <div className="bg-white/95 backdrop-blur-lg rounded-xl shadow-xl p-2 flex flex-col gap-2 border border-gray-200">
                        {/* Image specific tools */}
                        {selectedElement?.type === 'image' && (
                            <>
                                <button
                                    onClick={() => removeBackground(selectedId)}
                                    disabled={isProcessingBg}
                                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-700 relative group"
                                    title="Remove Background"
                                >
                                    {isProcessingBg ? (
                                        <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
                                    ) : (
                                        <Scissors className="w-5 h-5" />
                                    )}
                                </button>
                                <button
                                    onClick={() => setShowSpotlight(true)}
                                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-700 relative group"
                                    title="Magic Edit"
                                >
                                    <Sparkles className="w-5 h-5 text-indigo-600" />
                                </button>
                                <div className="h-px bg-gray-200 my-1" />
                            </>
                        )}

                        <button
                            onClick={() => moveLayer(selectedId, 'top')}
                            className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-700"
                            title="Bring to Front"
                        >
                            <BringToFront className="w-5 h-5" />
                        </button>
                        <button
                            onClick={() => moveLayer(selectedId, 'up')}
                            className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-700"
                            title="Bring Forward"
                        >
                            <ArrowUp className="w-5 h-5" />
                        </button>
                        <button
                            onClick={() => moveLayer(selectedId, 'down')}
                            className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-700"
                            title="Send Backward"
                        >
                            <ArrowDown className="w-5 h-5" />
                        </button>
                        <button
                            onClick={() => moveLayer(selectedId, 'bottom')}
                            className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-700"
                            title="Send to Back"
                        >
                            <SendToBack className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            )}

            {/* Text Properties Toolbar - Shows when text is selected (and not editing) */}
            {selectedElement?.type === 'text' && !editingState && (
                <div
                    className={`fixed top-24 left-1/2 -translate-x-1/2 z-50 transition-all duration-300 ${showToolbar ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4 pointer-events-none'
                        }`}
                >
                    <div className="bg-white/95 backdrop-blur-lg rounded-full shadow-xl px-4 py-2 flex items-center gap-2 border border-gray-200">
                        <TypeIcon className="w-4 h-4 text-gray-500" />
                        <select
                            value={selectedElement.fontFamily}
                            onChange={(e) => updateElement(selectedElement.id, { fontFamily: e.target.value })}
                            className="bg-transparent text-sm font-medium text-gray-700 outline-none cursor-pointer"
                        >
                            {JOURNAL_FONTS.map(font => (
                                <option key={font} value={font} style={{ fontFamily: font }}>
                                    {font}
                                </option>
                            ))}
                        </select>

                        <div className="w-px h-4 bg-gray-300 mx-2" />

                        <input
                            type="number"
                            value={selectedElement.fontSize}
                            onChange={(e) => updateElement(selectedElement.id, { fontSize: Number(e.target.value) })}
                            className="w-12 bg-transparent text-sm font-medium text-gray-700 outline-none text-center"
                            min="8"
                            max="200"
                        />
                        <span className="text-xs text-gray-500">px</span>

                        <div className="w-px h-4 bg-gray-300 mx-2" />

                        <input
                            type="color"
                            value={selectedElement.fill}
                            onChange={(e) => updateElement(selectedElement.id, { fill: e.target.value })}
                            className="w-6 h-6 rounded cursor-pointer border-none bg-transparent"
                        />
                    </div>
                </div>
            )}

            {/* Page Container */}
            <div className="relative">
                <div className="absolute -inset-8 bg-gradient-to-b from-black/10 via-black/5 to-black/20 rounded-2xl blur-2xl" />

                <div className="relative bg-white rounded-lg shadow-2xl overflow-hidden">
                    <Stage
                        ref={stageRef}
                        width={PAGE_WIDTH}
                        height={PAGE_HEIGHT}
                        onClick={(e) => {
                            const clickedOnEmpty = e.target === e.target.getStage() || e.target.name() === 'background';
                            if (clickedOnEmpty) {
                                setSelectedId(null);
                            }
                        }}
                    >
                        <Layer>
                            <Rect
                                name="background"
                                x={0}
                                y={0}
                                width={PAGE_WIDTH}
                                height={PAGE_HEIGHT}
                                fill={currentPageData.background || "#ffffff"}
                            />
                            {renderGrid()}

                            {currentPageData.elements.map((el) => {
                                if (el.type === 'text') {
                                    // Hide element if it is currently being edited to prevent ghosting
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
                                } else if (el.type === 'image') {
                                    return (
                                        <CanvasImage
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

                            <Transformer ref={transformerRef} />
                        </Layer>
                    </Stage>
                </div>

                {/* Navigation */}
                <button
                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                    className={`absolute left-0 top-1/2 -translate-y-1/2 -translate-x-20 w-14 h-14 rounded-full bg-white shadow-lg flex items-center justify-center transition-all ${currentPage === 1 ? 'opacity-30 cursor-not-allowed' : 'hover:bg-gray-50 hover:scale-110'
                        }`}
                >
                    <ChevronLeft className="w-7 h-7" />
                </button>

                <button
                    onClick={() => {
                        if (currentPage === pages.length) {
                            // 使用当前最大ID + 1，避免删除页面后ID冲突
                            const maxId = Math.max(...pages.map(p => p.id));
                            setPages([...pages, { id: maxId + 1, background: '#ffffff', elements: [] }]);
                        }
                        setCurrentPage(currentPage + 1);
                    }}
                    className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-20 w-14 h-14 rounded-full bg-white shadow-lg flex items-center justify-center hover:bg-gray-50 hover:scale-110 transition-all"
                >
                    <ChevronRight className="w-7 h-7" />
                </button>
            </div>

            {/* Page Indicator */}
            <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-white/95 backdrop-blur-lg rounded-full px-6 py-3 shadow-lg">
                <div className="flex items-center gap-2">
                    {pages.map((page) => (
                        <button
                            key={page.id}
                            onClick={() => setCurrentPage(page.id)}
                            className={`transition-all ${currentPage === page.id
                                ? 'w-8 h-2 bg-blue-600 rounded-full'
                                : 'w-2 h-2 bg-gray-300 rounded-full hover:bg-gray-400'
                                }`}
                        />
                    ))}
                    <div className="w-px h-4 bg-gray-300 mx-2" />
                    <span className="text-sm text-gray-600 font-medium">
                        {currentPage} / {pages.length}
                    </span>
                </div>
            </div>
        </div>
    );
}
