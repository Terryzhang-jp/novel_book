/**
 * Image Alignment Selector
 *
 * Bubble menu for selected images with alignment controls
 */

'use client';

import { useState, useEffect } from 'react';
import { EditorBubbleItem, useEditor } from 'novel';
import { Button } from '../ui/button';
import {
  AlignLeft,
  AlignCenter,
  AlignRight
} from 'lucide-react';

export function ImageAlignSelector() {
  const { editor } = useEditor();
  const [currentAlign, setCurrentAlign] = useState<string>('left');

  if (!editor) return null;

  useEffect(() => {
    // Update current alignment when selection changes
    const updateAlign = () => {
      const { align } = editor.getAttributes('image');
      setCurrentAlign(align || 'left');
    };

    editor.on('selectionUpdate', updateAlign);
    return () => {
      editor.off('selectionUpdate', updateAlign);
    };
  }, [editor]);

  const setAlign = (align: 'left' | 'center' | 'right') => {
    // Update the align attribute of the selected image
    editor.chain().focus().updateAttributes('image', { align }).run();
    setCurrentAlign(align);
  };

  // Check if current selection is an image
  const isImage = editor.isActive('image');

  if (!isImage) return null;

  return (
    <div className="flex items-center gap-1 p-1">
      <EditorBubbleItem
        onSelect={() => setAlign('left')}
      >
        <Button
          size="sm"
          variant={currentAlign === 'left' ? 'default' : 'ghost'}
          className="h-8 w-8 p-0"
        >
          <AlignLeft className="h-4 w-4" />
        </Button>
      </EditorBubbleItem>

      <EditorBubbleItem
        onSelect={() => setAlign('center')}
      >
        <Button
          size="sm"
          variant={currentAlign === 'center' ? 'default' : 'ghost'}
          className="h-8 w-8 p-0"
        >
          <AlignCenter className="h-4 w-4" />
        </Button>
      </EditorBubbleItem>

      <EditorBubbleItem
        onSelect={() => setAlign('right')}
      >
        <Button
          size="sm"
          variant={currentAlign === 'right' ? 'default' : 'ghost'}
          className="h-8 w-8 p-0"
        >
          <AlignRight className="h-4 w-4" />
        </Button>
      </EditorBubbleItem>
    </div>
  );
}
