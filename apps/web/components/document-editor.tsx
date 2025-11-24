"use client";

import {
  EditorCommand,
  EditorCommandEmpty,
  EditorCommandItem,
  EditorCommandList,
  EditorContent,
  type EditorInstance,
  EditorRoot,
  ImageResizer,
  type JSONContent,
  handleCommandNavigation,
  handleImageDrop,
  handleImagePaste,
} from "novel";
import { useState, useRef } from "react";
import { useDebouncedCallback } from "use-debounce";
import { defaultExtensions } from "./tailwind/extensions";
import { ColorSelector } from "./tailwind/selectors/color-selector";
import { LinkSelector } from "./tailwind/selectors/link-selector";
import { MathSelector } from "./tailwind/selectors/math-selector";
import { NodeSelector } from "./tailwind/selectors/node-selector";
import { ImageAlignSelector } from "./tailwind/selectors/image-align-selector";
import { Separator } from "./tailwind/ui/separator";
import GenerativeMenuSwitch from "./tailwind/generative/generative-menu-switch";
import { uploadFn } from "./tailwind/image-upload";
import { TextButtons } from "./tailwind/selectors/text-buttons";
import { slashCommand, suggestionItems } from "./tailwind/slash-command";

const extensions = [...defaultExtensions, slashCommand];

interface DocumentEditorProps {
  documentId: string;
  initialContent: JSONContent;
  onSave: (content: JSONContent) => Promise<void>;
  onEditorReady?: (editor: EditorInstance) => void;
  onTyping?: (isTyping: boolean) => void;
  zenMode?: boolean;
}

const DocumentEditor = ({
  documentId,
  initialContent,
  onSave,
  onEditorReady,
  onTyping,
  zenMode = true,
}: DocumentEditorProps) => {
  const [saveStatus, setSaveStatus] = useState("Saved");
  const [charsCount, setCharsCount] = useState<number>();
  const [isTyping, setIsTyping] = useState(false);

  const [openNode, setOpenNode] = useState(false);
  const [openColor, setOpenColor] = useState(false);
  const [openLink, setOpenLink] = useState(false);
  const [openAI, setOpenAI] = useState(false);

  const debouncedUpdates = useDebouncedCallback(
    async (editor: EditorInstance) => {
      const json = editor.getJSON();
      // Use character count instead of word count for better Chinese support
      setCharsCount(editor.storage.characterCount.characters());

      try {
        await onSave(json);
        setSaveStatus("Saved");
      } catch (error) {
        console.error("Failed to save document:", error);
        setSaveStatus("Error saving");
      }
    },
    500
  );

  // Typewriter Scrolling & Typing Detection
  const handleUpdate = ({ editor }: { editor: EditorInstance }) => {
    debouncedUpdates(editor);
    setSaveStatus("Unsaved");

    // Only enable spotlight mode if zenMode is active
    if (zenMode) {
      onTyping?.(true);
      setIsTyping(true);

      // Update spotlight effect - defer to avoid interfering with IME composition
      requestAnimationFrame(() => {
        updateSpotlight(editor);
      });
    }

    // Reset typing status after delay (only in Zen mode)
    if (zenMode) {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        onTyping?.(false);
        setIsTyping(false);

        // Clear spotlight classes when typing mode ends
        if (containerRef.current) {
          const proseMirror = containerRef.current.querySelector('.ProseMirror');
          if (proseMirror) {
            const allNodes = proseMirror.querySelectorAll('.spotlight-active, .spotlight-neighbor');
            allNodes.forEach(node => {
              node.classList.remove('spotlight-active', 'spotlight-neighbor');
            });
          }
        }
      }, 2000);
    }

    // Typewriter Scrolling
    const selection = editor.state.selection;
    const domSelection = editor.view.dom.ownerDocument.getSelection();
    if (domSelection && domSelection.rangeCount > 0) {
      const range = domSelection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      const viewportHeight = window.innerHeight;

      // If cursor is below 60% of viewport, scroll it up to center
      if (rect.top > viewportHeight * 0.6) {
        const targetScroll = window.scrollY + (rect.top - viewportHeight * 0.5);
        window.scrollTo({
          top: targetScroll,
          behavior: "smooth"
        });
      }
    }
  };

  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Update spotlight effect based on cursor position
  const updateSpotlight = (editor: EditorInstance) => {
    if (!containerRef.current) return;

    const { from } = editor.state.selection;
    const $pos = editor.state.doc.resolve(from);
    const activeNodePos = $pos.before($pos.depth);

    const proseMirror = containerRef.current.querySelector('.ProseMirror');
    if (proseMirror) {
      // Find and mark the active node
      let foundActive = false;
      editor.state.doc.descendants((node, pos) => {
        if (pos === activeNodePos) {
          const domNode = editor.view.nodeDOM(pos);
          if (domNode && domNode instanceof Element) {
            // Only update if this is a different node than before
            const previousActive = proseMirror.querySelector('.spotlight-active');
            if (previousActive !== domNode) {
              // Remove old spotlight classes
              const allNodes = proseMirror.querySelectorAll('.spotlight-active, .spotlight-neighbor');
              allNodes.forEach(node => {
                node.classList.remove('spotlight-active', 'spotlight-neighbor');
              });

              // Add new spotlight classes
              domNode.classList.add('spotlight-active');

              // Mark previous sibling
              const prevSibling = domNode.previousElementSibling;
              if (prevSibling) {
                prevSibling.classList.add('spotlight-neighbor');
              }

              // Mark next sibling
              const nextSibling = domNode.nextElementSibling;
              if (nextSibling) {
                nextSibling.classList.add('spotlight-neighbor');
              }
            }
            foundActive = true;
          }
          return false;
        }
        return true;
      });
    }
  };

  return (
    <div ref={containerRef} className={`relative w-full max-w-screen-lg ${zenMode && isTyping ? 'zen-spotlight-active' : ''}`}>
      <div className="absolute right-5 top-5 z-10 mb-5 flex gap-2">
        <div className="rounded-lg bg-accent px-2 py-1 text-sm text-muted-foreground">
          {saveStatus}
        </div>
        <div
          className={
            charsCount
              ? "rounded-lg bg-accent px-2 py-1 text-sm text-muted-foreground"
              : "hidden"
          }
        >
          {charsCount} Characters
        </div>
      </div>
      <EditorRoot>
        <EditorContent
          key={documentId}
          initialContent={initialContent}
          extensions={extensions}
          immediatelyRender={false}
          className="relative min-h-[500px] w-full max-w-screen-lg bg-transparent sm:mb-[calc(20vh)]"
          editorProps={{
            handleDOMEvents: {
              keydown: (_view, event) => handleCommandNavigation(event),
            },
            handlePaste: (view, event) =>
              handleImagePaste(view, event, uploadFn),
            handleDrop: (view, event, _slice, moved) =>
              handleImageDrop(view, event, moved, uploadFn),
            attributes: {
              class:
                "prose prose-lg dark:prose-invert prose-headings:font-title font-default focus:outline-none max-w-full",
            },
          }}
          onCreate={({ editor }) => {
            onEditorReady?.(editor);
          }}
          onUpdate={handleUpdate}
          slotAfter={<ImageResizer />}
        >
          <EditorCommand className="z-50 h-auto max-h-[330px] overflow-y-auto rounded-md border border-muted bg-background px-1 py-2 shadow-md transition-all">
            <EditorCommandEmpty className="px-2 text-muted-foreground">
              No results
            </EditorCommandEmpty>
            <EditorCommandList>
              {suggestionItems.map((item) => (
                <EditorCommandItem
                  value={item.title}
                  onCommand={(val) => item.command(val)}
                  className="flex w-full items-center space-x-2 rounded-md px-2 py-1 text-left text-sm text-foreground hover:bg-accent aria-selected:bg-accent"
                  key={item.title}
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-md border border-muted bg-background">
                    {item.icon}
                  </div>
                  <div>
                    <p className="font-medium text-foreground">{item.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.description}
                    </p>
                  </div>
                </EditorCommandItem>
              ))}
            </EditorCommandList>
          </EditorCommand>

          <GenerativeMenuSwitch open={openAI} onOpenChange={setOpenAI}>
            <Separator orientation="vertical" />
            <NodeSelector open={openNode} onOpenChange={setOpenNode} />
            <Separator orientation="vertical" />

            <LinkSelector open={openLink} onOpenChange={setOpenLink} />
            <Separator orientation="vertical" />
            <ImageAlignSelector />
            <Separator orientation="vertical" />
            <MathSelector />
            <Separator orientation="vertical" />
            <TextButtons />
            <Separator orientation="vertical" />
            <ColorSelector open={openColor} onOpenChange={setOpenColor} />
          </GenerativeMenuSwitch>
        </EditorContent>
      </EditorRoot>
    </div>
  );
};

export default DocumentEditor;
