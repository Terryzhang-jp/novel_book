/**
 * Photo Caption Editor Component (Novel Editor)
 *
 * 使用Novel编辑器为照片编写富文本描述
 *
 * Features:
 * - 富文本编辑（标题、列表、图片等）
 * - 自动保存（500ms防抖）
 * - 字数统计
 * - 保存状态显示
 * - 与文档编辑器一致的界面
 */

'use client';

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
} from 'novel';
import { useEffect, useState } from 'react';
import { useDebouncedCallback } from 'use-debounce';
import Image from 'next/image';
import { X, Maximize2 } from 'lucide-react';
import { defaultExtensions } from '../tailwind/extensions';
import { ColorSelector } from '../tailwind/selectors/color-selector';
import { LinkSelector } from '../tailwind/selectors/link-selector';
import { MathSelector } from '../tailwind/selectors/math-selector';
import { NodeSelector } from '../tailwind/selectors/node-selector';
import { Separator } from '../tailwind/ui/separator';
import GenerativeMenuSwitch from '../tailwind/generative/generative-menu-switch';
import { uploadFn } from '../tailwind/image-upload';
import { TextButtons } from '../tailwind/selectors/text-buttons';
import { slashCommand, suggestionItems } from '../tailwind/slash-command';

const hljs = require('highlight.js');

const extensions = [...defaultExtensions, slashCommand];

interface PhotoCaptionEditorProps {
  photoId: string | null;
  userId: string | null;
  photoFileUrl?: string;
  initialDescription?: JSONContent;
  onSave?: (photoId: string, description: JSONContent) => Promise<void>;
}

const PhotoCaptionEditor = ({
  photoId,
  userId,
  photoFileUrl,
  initialDescription,
  onSave,
}: PhotoCaptionEditorProps) => {
  const [saveStatus, setSaveStatus] = useState('已保存');
  const [charsCount, setCharsCount] = useState<number>();
  const [showFullImage, setShowFullImage] = useState(false);

  const [openNode, setOpenNode] = useState(false);
  const [openColor, setOpenColor] = useState(false);
  const [openLink, setOpenLink] = useState(false);
  const [openAI, setOpenAI] = useState(false);

  // Apply Codeblock Highlighting on the HTML from editor.getHTML()
  const highlightCodeblocks = (content: string) => {
    const doc = new DOMParser().parseFromString(content, 'text/html');
    doc.querySelectorAll('pre code').forEach((el) => {
      // @ts-ignore
      // https://highlightjs.readthedocs.io/en/latest/api.html?highlight=highlightElement#highlightelement
      hljs.highlightElement(el);
    });
    return new XMLSerializer().serializeToString(doc);
  };

  const debouncedUpdates = useDebouncedCallback(
    async (editor: EditorInstance) => {
      const json = editor.getJSON();
      setCharsCount(editor.storage.characterCount.words());

      if (!photoId || !onSave) return;

      try {
        await onSave(photoId, json);
        setSaveStatus('已保存');
      } catch (error) {
        console.error('Failed to save photo description:', error);
        setSaveStatus('保存失败');
      }
    },
    500
  );

  // Empty state when no photo is selected
  if (!photoId) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <p className="text-lg text-muted-foreground mb-2">未选择照片</p>
          <p className="text-sm text-muted-foreground">
            从左侧选择一张照片来编辑说明
          </p>
        </div>
      </div>
    );
  }

  const imageUrl = photoFileUrl || '';

  return (
    <div className="relative w-full h-full flex items-center justify-center p-6">
      <div className="w-full max-w-screen-lg">
        {/* Top Bar: View Image Button + Status */}
        <div className="absolute right-5 top-5 z-10 mb-5 flex gap-2">
          {imageUrl && (
            <button
              type="button"
              onClick={() => setShowFullImage(true)}
              className="flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-sm hover:bg-primary/90 transition-colors"
            >
              <Maximize2 className="w-4 h-4" />
              <span>查看大图</span>
            </button>
          )}
          <div className="rounded-lg bg-accent px-2 py-1 text-sm text-muted-foreground">
            {saveStatus}
          </div>
          <div
            className={
              charsCount
                ? 'rounded-lg bg-accent px-2 py-1 text-sm text-muted-foreground'
                : 'hidden'
            }
          >
            {charsCount} 词
          </div>
        </div>

        {/* Full Image Modal */}
        {showFullImage && imageUrl && (
          <div
            className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setShowFullImage(false)}
          >
            <button
              type="button"
              onClick={() => setShowFullImage(false)}
              className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors"
              aria-label="关闭"
            >
              <X className="w-6 h-6 text-white" />
            </button>
            <div className="relative max-w-7xl max-h-[90vh] w-full h-full">
              <Image
                src={imageUrl}
                alt="Full size photo"
                fill
                className="object-contain"
                sizes="100vw"
                priority
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          </div>
        )}
        <EditorRoot>
          <EditorContent
            key={photoId}
            initialContent={initialDescription}
            extensions={extensions}
            className="relative min-h-[500px] w-full max-w-screen-lg border-muted bg-background sm:mb-[calc(20vh)] sm:rounded-lg sm:border sm:shadow-lg"
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
                  'prose prose-lg dark:prose-invert prose-headings:font-title font-default focus:outline-none max-w-full',
              },
            }}
            onUpdate={({ editor }) => {
              debouncedUpdates(editor);
              setSaveStatus('未保存');
            }}
            slotAfter={<ImageResizer />}
          >
            <EditorCommand className="z-50 h-auto max-h-[330px] overflow-y-auto rounded-md border border-muted bg-background px-1 py-2 shadow-md transition-all">
              <EditorCommandEmpty className="px-2 text-muted-foreground">
                没有结果
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
              <MathSelector />
              <Separator orientation="vertical" />
              <TextButtons />
              <Separator orientation="vertical" />
              <ColorSelector open={openColor} onOpenChange={setOpenColor} />
            </GenerativeMenuSwitch>
          </EditorContent>
        </EditorRoot>
      </div>
    </div>
  );
};

export { PhotoCaptionEditor };
