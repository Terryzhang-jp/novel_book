"use client";

import { useState, useEffect, use, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/tailwind/ui/button";
import { ArrowLeft, Loader2, Sparkles } from "lucide-react";
import DocumentEditor from "@/components/document-editor";
import { PhotoSidebar } from "@/components/documents/photo-sidebar";
import type { JSONContent, EditorInstance } from "novel";

interface Document {
  id: string;
  userId: string;
  title: string;
  content: JSONContent;
  images: string[];
  tags?: string[];
  preview?: string;
  createdAt: string;
  updatedAt: string;
}

export default function EditDocumentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const [document, setDocument] = useState<Document | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const router = useRouter();
  const editorRef = useRef<EditorInstance | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false); // Default closed for Zen mode
  const [isHoveringTopLeft, setIsHoveringTopLeft] = useState(false);
  const [isHoveringRightEdge, setIsHoveringRightEdge] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [zenMode, setZenMode] = useState(true); // Toggle for Zen mode

  useEffect(() => {
    fetchDocument();
  }, [resolvedParams.id]);

  const fetchDocument = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/documents/${resolvedParams.id}`);

      if (response.ok) {
        const data = await response.json();
        setDocument(data.document);
      } else if (response.status === 401) {
        router.push("/login");
      } else if (response.status === 403) {
        setError("You don't have permission to view this document");
      } else if (response.status === 404) {
        setError("Document not found");
      } else {
        setError("Failed to load document");
      }
    } catch (err) {
      setError("An error occurred while loading the document");
    } finally {
      setLoading(false);
    }
  };

  const handleTitleChange = async (newTitle: string) => {
    if (!document) return;

    try {
      const response = await fetch(`/api/documents/${resolvedParams.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: newTitle,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setDocument(data.document);
      }
    } catch (err) {
      console.error("Failed to update title:", err);
    }
  };

  const handleContentSave = async (content: JSONContent) => {
    if (!document) return;

    try {
      await fetch(`/api/documents/${resolvedParams.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content,
        }),
      });
    } catch (err) {
      console.error("Failed to save content:", err);
    }
  };

  const handleEditorReady = (editor: EditorInstance) => {
    editorRef.current = editor;
  };

  const handlePhotoInsert = (photoUrl: string, align: 'left' | 'center' | 'right' = 'left') => {
    if (!editorRef.current) {
      console.warn("Editor not ready");
      return;
    }

    const editor = editorRef.current;

    // Insert image as a Tiptap node with alignment attribute
    // Collapse selection to end before inserting to prevent replacing selected content
    const { to } = editor.state.selection;
    editor
      .chain()
      .focus()
      .setTextSelection(to)
      .insertContent({
        type: 'image',
        attrs: {
          src: photoUrl,
          align: align
        }
      })
      .run();
  };


  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
        <div className="text-center">
          <Loader2 className="mx-auto mb-4 h-8 w-8 animate-spin text-blue-600" />
          <p className="text-gray-600">Loading document...</p>
        </div>
      </div>
    );
  }

  if (error || !document) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
        <div className="w-full max-w-md rounded-2xl bg-white p-10 text-center shadow-xl">
          <h2 className="mb-4 text-2xl font-bold text-gray-900">
            {error || "Document not found"}
          </h2>
          <Link href="/documents">
            <Button className="flex items-center space-x-2">
              <ArrowLeft className="h-4 w-4" />
              <span>Back to documents</span>
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={zenMode ? "min-h-screen bg-[#f9f9f7] text-[#333]" : "min-h-screen bg-background"}>

      {/* Zen Mode Toggle Button */}
      <div className="fixed top-4 right-4 z-50">
        <Button
          onClick={() => setZenMode(!zenMode)}
          variant={zenMode ? "ghost" : "outline"}
          size="sm"
          className={`flex items-center gap-2 transition-opacity duration-500 ${zenMode && !isHoveringTopLeft ? 'opacity-30 hover:opacity-100' : 'opacity-100'}`}
        >
          <Sparkles className={`w-4 h-4 ${zenMode ? 'text-yellow-600' : 'text-muted-foreground'}`} />
          <span className="text-xs">{zenMode ? 'Zen' : 'Normal'}</span>
        </Button>
      </div>

      {/* Hover Trigger Areas (Zen Mode Only) */}
      {zenMode && (
        <>
          <div
            className="fixed top-0 left-0 w-64 h-32 z-40"
            onMouseEnter={() => setIsHoveringTopLeft(true)}
            onMouseLeave={() => setIsHoveringTopLeft(false)}
          />
          <div
            className="fixed top-0 right-0 w-16 h-full z-40"
            onMouseEnter={() => setIsHoveringRightEdge(true)}
            onMouseLeave={() => setIsHoveringRightEdge(false)}
          />
        </>
      )}

      {/* Back Button */}
      {zenMode ? (
        <div
          className={`fixed top-8 left-8 z-50 transition-opacity duration-500 ${!isTyping && isHoveringTopLeft ? 'opacity-100' : 'opacity-0'}`}
        >
          <Link href="/documents">
            <Button variant="ghost" className="flex items-center space-x-2 text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4" />
              <span className="font-serif">Back</span>
            </Button>
          </Link>
        </div>
      ) : (
        <div className="fixed top-16 left-8 z-50">
          <Link href="/documents">
            <Button variant="outline" className="flex items-center space-x-2">
              <ArrowLeft className="h-4 w-4" />
              <span>Back</span>
            </Button>
          </Link>
        </div>
      )}

      {/* Photo Sidebar */}
      {zenMode ? (
        <>
          <div className={`fixed top-0 right-0 h-full z-50 transition-transform duration-500 ease-in-out ${sidebarOpen ? 'translate-x-0' : 'translate-x-full'}`}>
            <PhotoSidebar
              onPhotoInsert={handlePhotoInsert}
              onOpenChange={setSidebarOpen}
            />
          </div>

          {/* Sidebar Trigger (Right Edge) */}
          <div
            className={`fixed top-1/2 right-0 -translate-y-1/2 p-4 cursor-pointer transition-opacity duration-500 z-40 ${!isTyping && !sidebarOpen && isHoveringRightEdge ? 'opacity-100' : 'opacity-0'}`}
            onClick={() => setSidebarOpen(true)}
          >
            <div className="writing-mode-vertical text-muted-foreground font-serif text-sm tracking-widest hover:text-foreground">
              PHOTOS
            </div>
          </div>
        </>
      ) : (
        <div className={`fixed top-0 right-0 h-full z-50 transition-transform duration-300 ${sidebarOpen ? 'translate-x-0' : 'translate-x-full'}`}>
          <PhotoSidebar
            onPhotoInsert={handlePhotoInsert}
            onOpenChange={setSidebarOpen}
          />
        </div>
      )}

      {/* Main Content */}
      <div className={zenMode ? "mx-auto max-w-[800px] px-8 py-24 transition-all duration-500" : "mx-auto max-w-screen-lg px-8 py-8 transition-all duration-500"}>

        {/* Title */}
        <div className={zenMode ? `mb-12 transition-opacity duration-500 ${isTyping ? 'opacity-20 hover:opacity-100' : 'opacity-100'}` : 'mb-8'}>
          <input
            type="text"
            value={document.title}
            onChange={(e) => {
              const newTitle = e.target.value;
              setDocument((prev) =>
                prev ? { ...prev, title: newTitle } : null
              );
            }}
            onBlur={(e) => handleTitleChange(e.target.value)}
            className={zenMode ? "w-full border-none bg-transparent text-5xl font-serif font-bold text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:ring-0 text-center" : "w-full border-none bg-transparent text-3xl font-bold text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-0"}
            placeholder="Untitled Story"
          />
        </div>

        {/* Editor */}
        <main>
          <DocumentEditor
            documentId={document.id}
            initialContent={document.content}
            onSave={handleContentSave}
            onEditorReady={handleEditorReady}
            onTyping={zenMode ? setIsTyping : undefined}
            zenMode={zenMode}
          />
        </main>
      </div>
    </div>
  );
}
