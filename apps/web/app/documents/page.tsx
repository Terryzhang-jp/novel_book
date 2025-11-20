"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/tailwind/ui/button";
import { Plus, Search, Trash2, FileText } from "lucide-react";
import { AppLayout } from "@/components/layout/app-layout";

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
    <AppLayout>
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
        {/* Immersive Header */}
        <div className="sticky top-0 z-10 border-b border-border/40 bg-background/80 backdrop-blur-xl transition-all">
          <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <FileText className="h-5 w-5" />
                </div>
                <div>
                  <h1 className="text-xl font-serif font-bold text-foreground tracking-tight">
                    Library
                  </h1>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-widest">
                    {documents.length} {documents.length === 1 ? 'Entry' : 'Entries'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 flex-1 md:justify-end">
                {/* Integrated Search */}
                <div className="relative w-full md:w-64 group">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors" />
                  <input
                    type="text"
                    placeholder="Search archives..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-10 w-full rounded-full border border-border bg-muted/50 pl-9 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                  />
                </div>

                <Button onClick={handleCreateDocument} className="h-10 rounded-full px-4 shadow-lg shadow-primary/20">
                  <Plus className="mr-2 h-4 w-4" />
                  New Draft
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          {/* Search Bar Removed (Integrated in Header) */}

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
            <div className="flex flex-col items-center justify-center py-20 text-center animate-in fade-in zoom-in duration-500">
              <div className="w-20 h-20 bg-muted/50 rounded-full flex items-center justify-center mb-6">
                <FileText className="h-10 w-10 text-muted-foreground/50" />
              </div>
              <h3 className="mb-2 text-xl font-serif font-bold text-foreground">
                The Archive is Empty
              </h3>
              <p className="mb-8 text-muted-foreground max-w-sm mx-auto">
                Start your first draft. Capture your thoughts, stories, and ideas in a distraction-free environment.
              </p>
              <Button onClick={handleCreateDocument} size="lg" className="rounded-full shadow-xl shadow-primary/20">
                <Plus className="mr-2 h-5 w-5" />
                Create First Document
              </Button>
            </div>
          )}

          {/* No Search Results */}
          {!loading && filteredDocuments.length === 0 && searchQuery !== "" && (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Search className="mb-4 h-12 w-12 text-muted-foreground/30" />
              <h3 className="mb-2 text-lg font-medium text-foreground">
                No matches found
              </h3>
              <p className="text-muted-foreground">
                Try searching for a different keyword or tag.
              </p>
            </div>
          )}

          {/* Document Grid - Paper Style */}
          {!loading && filteredDocuments.length > 0 && (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filteredDocuments.map((doc) => (
                <div
                  key={doc.id}
                  className="group relative flex flex-col bg-card hover:bg-card/80 border border-border/50 hover:border-primary/50 rounded-xl shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden"
                >
                  <Link href={`/documents/${doc.id}`} className="flex-1 flex flex-col p-6">
                    {/* Paper Header */}
                    <div className="flex items-start justify-between mb-4">
                      <div className="w-10 h-10 rounded-lg bg-primary/5 flex items-center justify-center text-primary/60 group-hover:text-primary group-hover:bg-primary/10 transition-colors">
                        <FileText className="w-5 h-5" />
                      </div>
                      <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/70 bg-muted/50 px-2 py-1 rounded-md">
                        {formatDate(doc.updatedAt)}
                      </span>
                    </div>

                    {/* Content */}
                    <h3 className="mb-3 text-lg font-serif font-bold text-foreground leading-tight group-hover:text-primary transition-colors line-clamp-2">
                      {doc.title || "Untitled Draft"}
                    </h3>
                    <p className="mb-6 text-sm text-muted-foreground leading-relaxed line-clamp-3 flex-1 font-light">
                      {doc.preview || "Empty document..."}
                    </p>

                    {/* Footer / Tags */}
                    <div className="flex items-center justify-between mt-auto pt-4 border-t border-border/30">
                      <div className="flex flex-wrap gap-1.5">
                        {doc.tags.length > 0 ? (
                          doc.tags.slice(0, 2).map((tag, index) => (
                            <span
                              key={index}
                              className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium bg-primary/5 text-primary/70"
                            >
                              #{tag}
                            </span>
                          ))
                        ) : (
                          <span className="text-[10px] text-muted-foreground/50 italic">No tags</span>
                        )}
                        {doc.tags.length > 2 && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-muted text-muted-foreground">
                            +{doc.tags.length - 2}
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>

                  {/* Actions */}
                  <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        handleDeleteDocument(doc.id, doc.title);
                      }}
                      className="p-2 rounded-lg bg-background/80 backdrop-blur-sm text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shadow-sm border border-border/50"
                      title="Delete document"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Document Count */}
          {!loading && filteredDocuments.length > 0 && (
            <div className="mt-12 text-center">
              <p className="text-xs font-mono text-muted-foreground/50 uppercase tracking-widest">
                {searchQuery
                  ? `Found ${filteredDocuments.length} of ${documents.length} entries`
                  : `End of Archive • ${documents.length} entries`}
              </p>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

