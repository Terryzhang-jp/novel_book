/**
 * DocumentPicker Component - Minimal Gray Design
 *
 * Elegant right sidebar for inserting document content into canvas.
 * Remembers the last selected document for quick access.
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import { ChevronRight, ChevronLeft, Loader2, RefreshCw } from "lucide-react";
import type { Document, DocumentIndex, JSONContent } from "@/types/storage";

const STORAGE_KEY = "canvas-last-document-id";

interface DocumentPickerProps {
  onSelect: (text: string) => void;
  onClose: () => void;
}

interface Paragraph {
  id: string;
  text: string;
  type: "paragraph" | "heading";
}

function extractParagraphs(content: JSONContent): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  let index = 0;

  const traverse = (node: JSONContent) => {
    if (node.type === "paragraph" || node.type === "heading") {
      let text = "";
      if (node.content && Array.isArray(node.content)) {
        for (const child of node.content) {
          if (child.type === "text" && child.text) {
            text += child.text;
          }
        }
      }
      if (text.trim()) {
        paragraphs.push({
          id: `p-${index++}`,
          text: text.trim(),
          type: node.type as "paragraph" | "heading",
        });
      }
    }

    if (node.content && Array.isArray(node.content)) {
      for (const child of node.content) {
        traverse(child);
      }
    }
  };

  traverse(content);
  return paragraphs;
}

export function DocumentPicker({ onSelect, onClose }: DocumentPickerProps) {
  const [documents, setDocuments] = useState<DocumentIndex[]>([]);
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [paragraphs, setParagraphs] = useState<Paragraph[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingDoc, setIsLoadingDoc] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDocumentList, setShowDocumentList] = useState(false);

  // Load document list and check for remembered document
  useEffect(() => {
    const init = async () => {
      try {
        setIsLoading(true);

        // Fetch document list
        const response = await fetch("/api/documents");
        if (!response.ok) throw new Error("Failed to fetch documents");
        const data = await response.json();
        const docs = data.documents || [];
        setDocuments(docs);

        // Check for remembered document
        const lastDocId = localStorage.getItem(STORAGE_KEY);
        if (lastDocId && docs.length > 0) {
          const lastDoc = docs.find((d: DocumentIndex) => d.id === lastDocId);
          if (lastDoc) {
            // Auto-load the last selected document
            await loadDocument(lastDocId);
            return;
          }
        }

        // No remembered document, show list
        setShowDocumentList(true);
      } catch (err) {
        setError("无法加载文档");
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };
    init();
  }, []);

  // Load a specific document
  const loadDocument = async (docId: string) => {
    try {
      setIsLoadingDoc(true);
      const response = await fetch(`/api/documents/${docId}`);
      if (!response.ok) throw new Error("Failed to fetch document");
      const data = await response.json();
      const doc = data.document as Document;
      setSelectedDocument(doc);
      setParagraphs(extractParagraphs(doc.content));

      // Remember this document
      localStorage.setItem(STORAGE_KEY, docId);
      setShowDocumentList(false);
    } catch (err) {
      setError("无法加载文档内容");
      console.error(err);
      setShowDocumentList(true);
    } finally {
      setIsLoadingDoc(false);
    }
  };

  // Handle document selection from list
  const handleDocumentSelect = useCallback(async (docIndex: DocumentIndex) => {
    await loadDocument(docIndex.id);
  }, []);

  // Switch to document list (change document)
  const handleChangeDocument = useCallback(() => {
    setShowDocumentList(true);
  }, []);

  // Handle paragraph selection
  const handleParagraphSelect = useCallback(
    (paragraph: Paragraph) => {
      onSelect(paragraph.text);
    },
    [onSelect]
  );

  // Show document list view
  const renderDocumentList = () => (
    <div className="py-1">
      {documents.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40">
          <span className="text-sm text-neutral-400">暂无文档</span>
        </div>
      ) : (
        documents.map((doc) => (
          <button
            key={doc.id}
            onClick={() => handleDocumentSelect(doc)}
            className="w-full px-4 py-3 text-left hover:bg-neutral-50 transition-colors group"
          >
            <div className="text-sm text-neutral-700 group-hover:text-neutral-900 font-medium truncate">
              {doc.title}
            </div>
            {doc.preview && (
              <div className="text-xs text-neutral-400 mt-0.5 line-clamp-1">
                {doc.preview}
              </div>
            )}
          </button>
        ))
      )}
    </div>
  );

  // Show paragraph list view
  const renderParagraphList = () => (
    <div className="py-1">
      {paragraphs.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40">
          <span className="text-sm text-neutral-400">无文字内容</span>
        </div>
      ) : (
        paragraphs.map((para) => (
          <button
            key={para.id}
            onClick={() => handleParagraphSelect(para)}
            className="w-full px-4 py-3 text-left hover:bg-neutral-50 transition-colors group"
          >
            <div className="flex items-start gap-2.5">
              <span
                className={`flex-shrink-0 w-5 h-5 rounded text-[10px] font-medium flex items-center justify-center mt-0.5 ${
                  para.type === "heading"
                    ? "bg-neutral-200 text-neutral-600"
                    : "bg-neutral-100 text-neutral-400"
                }`}
              >
                {para.type === "heading" ? "H" : "P"}
              </span>
              <span
                className={`text-sm leading-relaxed line-clamp-2 ${
                  para.type === "heading"
                    ? "text-neutral-800 font-medium"
                    : "text-neutral-600"
                } group-hover:text-neutral-900`}
              >
                {para.text}
              </span>
            </div>
          </button>
        ))
      )}
    </div>
  );

  return (
    <div
      className="fixed top-0 bottom-0 z-30 bg-white border-l border-neutral-200 shadow-xl flex flex-col"
      style={{ width: "300px", right: "72px" }}
    >
      {/* Header */}
      <div className="h-14 px-4 flex items-center justify-between border-b border-neutral-100 flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {showDocumentList && selectedDocument ? (
            <button
              onClick={() => setShowDocumentList(false)}
              className="p-1 -ml-1 hover:bg-neutral-100 rounded transition-colors"
              title="返回段落"
            >
              <ChevronLeft className="w-4 h-4 text-neutral-400" />
            </button>
          ) : null}
          <span className="text-sm font-medium text-neutral-800 truncate">
            {showDocumentList ? "选择文档" : (selectedDocument?.title || "文档")}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {!showDocumentList && selectedDocument && (
            <button
              onClick={handleChangeDocument}
              className="p-1.5 hover:bg-neutral-100 rounded transition-colors"
              title="切换文档"
            >
              <RefreshCw className="w-3.5 h-3.5 text-neutral-400" />
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1 hover:bg-neutral-100 rounded transition-colors"
          >
            <ChevronRight className="w-4 h-4 text-neutral-400" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {isLoading || isLoadingDoc ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="w-5 h-5 text-neutral-300 animate-spin" />
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-40">
            <span className="text-sm text-neutral-400">{error}</span>
          </div>
        ) : showDocumentList ? (
          renderDocumentList()
        ) : (
          renderParagraphList()
        )}
      </div>

      {/* Footer */}
      {!isLoading && !isLoadingDoc && !error && (
        <div className="h-10 px-4 flex items-center justify-center border-t border-neutral-100 flex-shrink-0">
          <span className="text-[11px] text-neutral-400">
            {showDocumentList
              ? `${documents.length} 个文档`
              : `${paragraphs.length} 个段落 · 点击插入`
            }
          </span>
        </div>
      )}
    </div>
  );
}
