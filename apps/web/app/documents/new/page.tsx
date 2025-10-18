"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/tailwind/ui/button";
import { FileText, ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function NewDocumentPage() {
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!title.trim()) {
      setError("Please enter a title");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/documents", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: title.trim(),
          content: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [],
              },
            ],
          },
        }),
      });

      const data = await response.json();

      if (response.ok) {
        router.push(`/documents/${data.document.id}`);
      } else if (response.status === 401) {
        router.push("/login");
      } else {
        setError(data.error || "Failed to create document");
      }
    } catch (err) {
      setError("An error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="w-full max-w-md space-y-8 rounded-2xl bg-white p-10 shadow-xl">
        <div className="text-center">
          <div className="mb-4 flex justify-center">
            <div className="rounded-full bg-blue-100 p-3">
              <FileText className="h-8 w-8 text-blue-600" />
            </div>
          </div>
          <h2 className="text-3xl font-bold tracking-tight text-gray-900">
            Create New Document
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Enter a title to get started
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-8 space-y-6">
          <div>
            <label htmlFor="title" className="sr-only">
              Document Title
            </label>
            <input
              id="title"
              name="title"
              type="text"
              autoFocus
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="relative block w-full appearance-none rounded-lg border border-gray-300 px-4 py-3 text-gray-900 placeholder-gray-500 focus:z-10 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 sm:text-sm"
              placeholder="Enter document title"
              maxLength={100}
            />
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
              {error}
            </div>
          )}

          <div className="flex space-x-3">
            <Link href="/documents" className="flex-1">
              <Button
                type="button"
                variant="outline"
                className="flex w-full items-center justify-center space-x-2 rounded-lg py-3 text-sm font-semibold"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>Cancel</span>
              </Button>
            </Link>
            <Button
              type="submit"
              disabled={loading || !title.trim()}
              className="flex-1 rounded-lg py-3 text-sm font-semibold"
            >
              {loading ? "Creating..." : "Create Document"}
            </Button>
          </div>
        </form>

        <div className="text-center text-sm text-gray-600">
          <Link
            href="/documents"
            className="font-medium text-blue-600 hover:text-blue-500"
          >
            Back to documents
          </Link>
        </div>
      </div>
    </div>
  );
}
