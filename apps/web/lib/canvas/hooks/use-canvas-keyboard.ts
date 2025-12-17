/**
 * useCanvasKeyboard Hook
 *
 * Handles all keyboard shortcuts for the canvas:
 * - Delete/Backspace: Delete selected element
 * - Space: Hold for pan mode
 * - Ctrl+Z: Undo
 * - Ctrl+Shift+Z / Ctrl+Y: Redo
 * - V: Select tool
 * - Escape: Deselect / Close editing
 */

import { useEffect, useCallback } from "react";
import { useCanvasStore } from "../canvas-store";

export function useCanvasKeyboard() {
  const {
    selectedId,
    selectedIds,
    editingState,
    deleteElement,
    deleteSelectedElements,
    setTool,
    clearSelection,
    stopEditing,
    undo,
    redo,
    copyElement,
    pasteElement,
  } = useCanvasStore();

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Ignore if typing in an input
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        // But still allow Escape to close editing
        if (e.key === "Escape" && editingState) {
          stopEditing();
        }
        return;
      }

      // Delete selected element(s)
      if ((e.key === "Backspace" || e.key === "Delete") && !editingState) {
        if (selectedIds.length > 0 || selectedId) {
          e.preventDefault();
          deleteSelectedElements();
          return;
        }
      }

      // Space: Pan mode
      if (e.code === "Space" && !editingState) {
        e.preventDefault();
        setTool("pan");
        return;
      }

      // V: Select tool
      if (e.key === "v" || e.key === "V") {
        if (!editingState) {
          setTool("select");
        }
        return;
      }

      // Escape: Deselect or close editing
      if (e.key === "Escape") {
        if (editingState) {
          stopEditing();
        } else if (selectedId) {
          clearSelection();
        }
        return;
      }

      // Undo: Ctrl+Z
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }

      // Redo: Ctrl+Shift+Z or Ctrl+Y
      if (
        (e.ctrlKey || e.metaKey) &&
        ((e.key === "z" && e.shiftKey) || e.key === "y")
      ) {
        e.preventDefault();
        redo();
        return;
      }

      // Copy: Ctrl+C
      if ((e.ctrlKey || e.metaKey) && e.key === "c" && selectedId) {
        e.preventDefault();
        copyElement();
        return;
      }

      // Paste: Ctrl+V
      if ((e.ctrlKey || e.metaKey) && e.key === "v") {
        e.preventDefault();
        pasteElement();
        return;
      }

      // Duplicate: Ctrl+D
      if ((e.ctrlKey || e.metaKey) && e.key === "d" && selectedId) {
        e.preventDefault();
        copyElement();
        pasteElement();
        return;
      }
    },
    [selectedId, selectedIds, editingState, deleteSelectedElements, setTool, clearSelection, stopEditing, undo, redo, copyElement, pasteElement]
  );

  const handleKeyUp = useCallback(
    (e: KeyboardEvent) => {
      // Release Space: Back to select
      if (e.code === "Space") {
        setTool("select");
      }
    },
    [setTool]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [handleKeyDown, handleKeyUp]);
}
