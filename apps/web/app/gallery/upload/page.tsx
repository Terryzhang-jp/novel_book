"use client";

import { useState, useRef, type ChangeEvent, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Upload, X, CheckCircle, XCircle } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { AppLayout } from "@/components/layout/app-layout";

interface UploadingFile {
  file: File;
  preview: string;
  status: "pending" | "uploading" | "success" | "error";
  error?: string;
}

export default function UploadPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedFiles, setSelectedFiles] = useState<UploadingFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const handleFilesSelect = (files: FileList | File[]) => {
    const validTypes = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp", "image/heic", "image/heif"];
    const maxSize = 10 * 1024 * 1024; // 10MB

    const newFiles: UploadingFile[] = [];
    const fileArray = Array.from(files);

    for (const file of fileArray) {
      // Validate file type
      if (!validTypes.includes(file.type)) {
        setError(`${file.name}: Invalid file type. Please select valid image files.`);
        continue;
      }

      // Validate file size
      if (file.size > maxSize) {
        setError(`${file.name}: File size must be less than 10MB`);
        continue;
      }

      // Create preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedFiles((prev) => {
          const index = prev.findIndex((f) => f.file.name === file.name);
          if (index !== -1) {
            const updated = [...prev];
            updated[index] = { ...updated[index], preview: reader.result as string };
            return updated;
          }
          return prev;
        });
      };
      reader.readAsDataURL(file);

      newFiles.push({
        file,
        preview: "",
        status: "pending",
      });
    }

    setSelectedFiles((prev) => [...prev, ...newFiles]);
    setError(null);
  };

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFilesSelect(files);
    }
  };

  const handleDrag = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFilesSelect(files);
    }
  };

  const handleUploadAll = async () => {
    if (selectedFiles.length === 0) return;

    setUploading(true);
    setError(null);

    let successCount = 0;
    let errorCount = 0;

    // Upload files sequentially (to avoid overwhelming the server)
    for (let i = 0; i < selectedFiles.length; i++) {
      const uploadingFile = selectedFiles[i];

      if (uploadingFile.status !== "pending") continue;

      // Update status to uploading
      setSelectedFiles((prev) => {
        const updated = [...prev];
        updated[i] = { ...updated[i], status: "uploading" };
        return updated;
      });

      try {
        const formData = new FormData();
        formData.append("file", uploadingFile.file);

        const response = await fetch("/api/photos", {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Failed to upload photo");
        }

        // Update status to success
        setSelectedFiles((prev) => {
          const updated = [...prev];
          updated[i] = { ...updated[i], status: "success" };
          return updated;
        });

        successCount++;
      } catch (err) {
        // Update status to error
        setSelectedFiles((prev) => {
          const updated = [...prev];
          updated[i] = {
            ...updated[i],
            status: "error",
            error: err instanceof Error ? err.message : "Failed to upload",
          };
          return updated;
        });

        errorCount++;
      }
    }

    setUploading(false);

    // Check if all uploads were successful (use counters instead of state)
    const totalPending = selectedFiles.filter((f) => f.status === "pending").length;
    if (successCount === totalPending && errorCount === 0) {
      // All uploads successful - redirect to gallery after a short delay
      setTimeout(() => {
        router.push("/gallery");
      }, 1000);
    }
  };

  const removeFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
    setError(null);
  };

  const clearAll = () => {
    setSelectedFiles([]);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <AppLayout>
      <div className="min-h-screen bg-background p-8">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-4">
              <Link
                href="/gallery"
                className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
                <span>Back to Gallery</span>
              </Link>
            </div>
            <h1 className="text-3xl font-bold text-foreground">Upload Photo</h1>
          </div>

          {/* Upload Area */}
          <div className="space-y-6">
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            className={`
              border-2 border-dashed rounded-lg p-12 text-center transition-colors
              ${
                dragActive
                  ? "border-primary bg-primary/5"
                  : "border-border bg-card"
              }
            `}
          >
            <div className="flex flex-col items-center gap-4">
              <Upload className="w-16 h-16 text-muted-foreground" />
              <div>
                <h3 className="text-xl font-semibold text-foreground mb-2">
                  Drag & Drop Photos Here
                </h3>
                <p className="text-muted-foreground mb-4">or</p>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
                >
                  Choose Files
                </button>
              </div>
              <div className="text-sm text-muted-foreground space-y-1">
                <p>Supported: JPEG, PNG, GIF, WebP, HEIC</p>
                <p>Max size: 10MB per file</p>
                <p className="font-medium">You can select multiple files</p>
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/jpg,image/png,image/gif,image/webp,image/heic,image/heif"
              onChange={handleInputChange}
              multiple
              className="hidden"
            />
          </div>

          {/* Selected Files Preview */}
          {selectedFiles.length > 0 && (
            <div className="bg-card rounded-lg p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-foreground">
                  Selected Files ({selectedFiles.length})
                </h3>
                <button
                  onClick={clearAll}
                  disabled={uploading}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                >
                  Clear All
                </button>
              </div>

              {/* File Grid */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {selectedFiles.map((uploadingFile, index) => (
                  <div
                    key={index}
                    className="relative bg-muted rounded-lg overflow-hidden"
                  >
                    {/* Preview Image */}
                    {uploadingFile.preview && (
                      <div className="relative aspect-square">
                        <Image
                          src={uploadingFile.preview}
                          alt={uploadingFile.file.name}
                          fill
                          className="object-cover"
                        />
                      </div>
                    )}

                    {/* Status Overlay */}
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                      {uploadingFile.status === "pending" && (
                        <button
                          onClick={() => removeFile(index)}
                          disabled={uploading}
                          className="p-2 bg-destructive text-destructive-foreground rounded-full hover:bg-destructive/90 transition-colors disabled:opacity-50"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                      {uploadingFile.status === "uploading" && (
                        <div className="text-white text-sm">Uploading...</div>
                      )}
                      {uploadingFile.status === "success" && (
                        <CheckCircle className="w-8 h-8 text-green-500" />
                      )}
                      {uploadingFile.status === "error" && (
                        <div className="flex flex-col items-center gap-2">
                          <XCircle className="w-8 h-8 text-red-500" />
                          <p className="text-xs text-white text-center px-2">
                            {uploadingFile.error}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* File Info */}
                    <div className="p-2 bg-background/90">
                      <p className="text-xs text-foreground truncate">
                        {uploadingFile.file.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {(uploadingFile.file.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Upload Button */}
              <button
                onClick={handleUploadAll}
                disabled={uploading || selectedFiles.every((f) => f.status !== "pending")}
                className="w-full px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {uploading
                  ? `Uploading ${selectedFiles.filter((f) => f.status === "uploading").length} of ${selectedFiles.length}...`
                  : `Upload ${selectedFiles.filter((f) => f.status === "pending").length} Photos`}
              </button>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="bg-destructive/10 border border-destructive text-destructive rounded-lg p-4">
              {error}
            </div>
          )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
