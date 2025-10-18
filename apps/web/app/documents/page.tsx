"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/tailwind/ui/button";
import { Plus, Search, Trash2, FileText, LogOut } from "lucide-react";

interface DocumentIndex {
  id: string;
  title: string;
  preview: string;
  tags: string[];
  updatedAt: string;
}

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<DocumentIndex[]>([]);
  const [filteredDocuments, setFilteredDocuments] = useState<DocumentIndex[]>(
    []
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const router = useRouter();

  useEffect(() => {
    fetchDocuments();
  }, []);

  useEffect(() => {
    if (searchQuery.trim() === "") {
      setFilteredDocuments(documents);
    } else {
      const query = searchQuery.toLowerCase();
      const filtered = documents.filter(
        (doc) =>
          doc.title.toLowerCase().includes(query) ||
          doc.preview.toLowerCase().includes(query) ||
          doc.tags.some((tag) => tag.toLowerCase().includes(query))
      );
      setFilteredDocuments(filtered);
    }
  }, [searchQuery, documents]);

  const fetchDocuments = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/documents");

      if (response.ok) {
        const data = await response.json();
        setDocuments(data.documents || []);
        setFilteredDocuments(data.documents || []);
      } else if (response.status === 401) {
        router.push("/login");
      } else {
        setError("Failed to load documents");
      }
    } catch (err) {
      setError("An error occurred while loading documents");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateDocument = () => {
    router.push("/documents/new");
  };

  const handleDeleteDocument = async (id: string, title: string) => {
    if (!confirm(`Are you sure you want to delete "${title}"?`)) {
      return;
    }

    try {
      const response = await fetch(`/api/documents/${id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        setDocuments((prev) => prev.filter((doc) => doc.id !== id));
      } else {
        alert("Failed to delete document");
      }
    } catch (err) {
      alert("An error occurred while deleting the document");
    }
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    } catch (err) {
      console.error("Logout failed:", err);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins} minutes ago`;
    if (diffHours < 24) return `${diffHours} hours ago`;
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <header className="border-b bg-white shadow-sm">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <FileText className="h-8 w-8 text-blue-600" />
              <h1 className="text-2xl font-bold text-gray-900">
                My Documents
              </h1>
            </div>
            <div className="flex items-center space-x-3">
              <Button onClick={handleCreateDocument} className="flex items-center space-x-2">
                <Plus className="h-4 w-4" />
                <span>New Document</span>
              </Button>
              <Button
                onClick={handleLogout}
                variant="outline"
                className="flex items-center space-x-2"
              >
                <LogOut className="h-4 w-4" />
                <span>Logout</span>
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Search Bar */}
        <div className="mb-8">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search documents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white py-3 pl-12 pr-4 text-gray-900 placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 rounded-lg bg-red-50 p-4 text-sm text-red-800">
            {error}
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent"></div>
              <p className="text-gray-600">Loading documents...</p>
            </div>
          </div>
        )}

        {/* Empty State */}
        {!loading && filteredDocuments.length === 0 && searchQuery === "" && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <FileText className="mb-4 h-16 w-16 text-gray-300" />
            <h3 className="mb-2 text-lg font-semibold text-gray-900">
              No documents yet
            </h3>
            <p className="mb-6 text-gray-600">
              Create your first document to get started
            </p>
            <Button onClick={handleCreateDocument} className="flex items-center space-x-2">
              <Plus className="h-4 w-4" />
              <span>Create Document</span>
            </Button>
          </div>
        )}

        {/* No Search Results */}
        {!loading && filteredDocuments.length === 0 && searchQuery !== "" && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Search className="mb-4 h-16 w-16 text-gray-300" />
            <h3 className="mb-2 text-lg font-semibold text-gray-900">
              No documents found
            </h3>
            <p className="text-gray-600">
              Try adjusting your search query
            </p>
          </div>
        )}

        {/* Document Grid */}
        {!loading && filteredDocuments.length > 0 && (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {filteredDocuments.map((doc) => (
              <div
                key={doc.id}
                className="group relative overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-all hover:shadow-lg"
              >
                <Link href={`/documents/${doc.id}`}>
                  <div className="p-6">
                    <h3 className="mb-2 truncate text-lg font-semibold text-gray-900 group-hover:text-blue-600">
                      {doc.title || "Untitled"}
                    </h3>
                    <p className="mb-4 line-clamp-3 text-sm text-gray-600">
                      {doc.preview || "No content yet..."}
                    </p>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500">
                        {formatDate(doc.updatedAt)}
                      </span>
                      {doc.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {doc.tags.slice(0, 2).map((tag, index) => (
                            <span
                              key={index}
                              className="rounded-full bg-blue-100 px-2 py-1 text-xs text-blue-700"
                            >
                              {tag}
                            </span>
                          ))}
                          {doc.tags.length > 2 && (
                            <span className="rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-700">
                              +{doc.tags.length - 2}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </Link>

                {/* Delete Button */}
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    handleDeleteDocument(doc.id, doc.title);
                  }}
                  className="absolute right-4 top-4 rounded-lg bg-white p-2 opacity-0 shadow-md transition-opacity hover:bg-red-50 group-hover:opacity-100"
                  title="Delete document"
                >
                  <Trash2 className="h-4 w-4 text-red-600" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Document Count */}
        {!loading && filteredDocuments.length > 0 && (
          <div className="mt-8 text-center text-sm text-gray-600">
            {searchQuery
              ? `${filteredDocuments.length} of ${documents.length} documents`
              : `${documents.length} ${documents.length === 1 ? "document" : "documents"}`}
          </div>
        )}
      </main>
    </div>
  );
}
