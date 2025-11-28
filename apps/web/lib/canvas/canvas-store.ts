/**
 * Canvas Store - State Management
 * 
 * Manages canvas state, elements, history, and operations
 */

import { create } from 'zustand';
import type { CanvasElement } from '@/components/canvas/types';
import { v4 as uuidv4 } from 'uuid';

interface CanvasState {
    // Canvas state
    elements: CanvasElement[];
    selectedId: string | null;
    selectedTool: string;
    canvasSize: { width: number; height: number };
    zoom: number;

    // History
    history: CanvasElement[][];
    historyIndex: number;

    // Drawing state
    isDrawing: boolean;
    currentDrawingPoints: number[];

    // Actions
    setElements: (elements: CanvasElement[]) => void;
    addElement: (element: CanvasElement) => void;
    updateElement: (id: string, updates: Partial<CanvasElement>) => void;
    deleteElement: (id: string) => void;
    setSelectedId: (id: string | null) => void;
    setSelectedTool: (tool: string) => void;
    setZoom: (zoom: number) => void;

    // History
    undo: () => void;
    redo: () => void;
    pushHistory: () => void;

    // Drawing
    startDrawing: (x: number, y: number) => void;
    continueDrawing: (x: number, y: number) => void;
    endDrawing: () => void;
}

export const useCanvasStore = create<CanvasState>((set, get) => ({
    // Initial state
    elements: [],
    selectedId: null,
    selectedTool: 'select',
    canvasSize: { width: 1920, height: 1080 },
    zoom: 1,
    history: [[]],
    historyIndex: 0,
    isDrawing: false,
    currentDrawingPoints: [],

    // Actions
    setElements: (elements) => {
        set({ elements });
        get().pushHistory();
    },

    addElement: (element) => {
        set((state) => ({
            elements: [...state.elements, element],
        }));
        get().pushHistory();
    },

    updateElement: (id, updates) => {
        set((state) => ({
            elements: state.elements.map((el) =>
                el.id === id ? { ...el, ...updates } : el
            ),
        }));
    },

    deleteElement: (id) => {
        set((state) => ({
            elements: state.elements.filter((el) => el.id !== id),
            selectedId: state.selectedId === id ? null : state.selectedId,
        }));
        get().pushHistory();
    },

    setSelectedId: (id) => set({ selectedId: id }),
    setSelectedTool: (tool) => set({ selectedTool: tool }),
    setZoom: (zoom) => set({ zoom }),

    // History
    pushHistory: () => {
        set((state) => {
            const newHistory = state.history.slice(0, state.historyIndex + 1);
            newHistory.push([...state.elements]);
            return {
                history: newHistory,
                historyIndex: newHistory.length - 1,
            };
        });
    },

    undo: () => {
        set((state) => {
            if (state.historyIndex > 0) {
                const newIndex = state.historyIndex - 1;
                return {
                    elements: [...state.history[newIndex]],
                    historyIndex: newIndex,
                };
            }
            return state;
        });
    },

    redo: () => {
        set((state) => {
            if (state.historyIndex < state.history.length - 1) {
                const newIndex = state.historyIndex + 1;
                return {
                    elements: [...state.history[newIndex]],
                    historyIndex: newIndex,
                };
            }
            return state;
        });
    },

    // Drawing
    startDrawing: (x, y) => {
        set({
            isDrawing: true,
            currentDrawingPoints: [x, y],
        });
    },

    continueDrawing: (x, y) => {
        set((state) => ({
            currentDrawingPoints: [...state.currentDrawingPoints, x, y],
        }));
    },

    endDrawing: () => {
        const { currentDrawingPoints, elements } = get();

        if (currentDrawingPoints.length > 2) {
            const newElement: CanvasElement = {
                id: uuidv4(),
                type: 'drawing',
                x: 0,
                y: 0,
                width: 0,
                height: 0,
                rotation: 0,
                scaleX: 1,
                scaleY: 1,
                opacity: 1,
                zIndex: elements.length,
                data: {
                    points: currentDrawingPoints,
                    stroke: '#000000',
                    strokeWidth: 3,
                },
            };

            set((state) => ({
                elements: [...state.elements, newElement],
                isDrawing: false,
                currentDrawingPoints: [],
            }));
            get().pushHistory();
        } else {
            set({
                isDrawing: false,
                currentDrawingPoints: [],
            });
        }
    },
}));
