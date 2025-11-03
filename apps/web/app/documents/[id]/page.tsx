"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/tailwind/ui/button";
import { ArrowLeft, Loader2 } from "lucide-react";
import DocumentEditor from "@/components/document-editor";
import type { JSONContent } from "novel";
import { AppLayout } from "@/components/layout/app-layout";

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

  if (loading) {
    return (
      <AppLayout>
        <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
          <div className="text-center">
            <Loader2 className="mx-auto mb-4 h-8 w-8 animate-spin text-blue-600" />
            <p className="text-gray-600">Loading document...</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (error || !document) {
    return (
      <AppLayout>
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
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card shadow-sm">
        <div className="mx-auto max-w-screen-lg px-4 py-4">
          <div className="flex items-center justify-between">
            <Link href="/documents">
              <Button variant="outline" className="flex items-center space-x-2">
                <ArrowLeft className="h-4 w-4" />
                <span>Back</span>
              </Button>
            </Link>
            <div className="flex-1 mx-8">
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
                className="w-full border-none bg-transparent text-2xl font-bold text-foreground focus:outline-none focus:ring-0"
                placeholder="Untitled"
              />
            </div>
          </div>
        </div>
      </header>

      {/* Editor */}
      <main className="mx-auto max-w-screen-lg px-4 py-8">
        <DocumentEditor
          documentId={document.id}
          initialContent={document.content}
          onSave={handleContentSave}
        />
      </main>
      </div>
    </AppLayout>
  );
}
