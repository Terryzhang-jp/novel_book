"use client";

import { useState, useRef, useEffect, useCallback, type ChangeEvent, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Upload, X, CheckCircle, XCircle, Pause, Play, Loader2 } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { AppLayout } from "@/components/layout/app-layout";
import imageCompression from "browser-image-compression";

type FileStatus =
  | "queued"       // Just added, waiting to be processed
  | "compressing"  // Currently being compressed
  | "compressed"   // Compression done, ready to upload
  | "uploading"    // Currently uploading
  | "success"      // Upload successful
  | "error";       // Error occurred

interface UploadingFile {
  id: string;
  file: File;
  originalFile: File;  // Keep original for retry
  preview: string | null;  // Object URL (not base64!)
  status: FileStatus;
  error?: string;
  compressedSize?: number;
}

interface ProcessingProgress {
  total: number;
  compressed: number;
  uploaded: number;
}

const BATCH_SIZE_COMPRESS = 10;  // Compress 10 at a time
const BATCH_SIZE_UPLOAD = 5;     // Upload 5 at a time

export default function UploadPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const [selectedFiles, setSelectedFiles] = useState<UploadingFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [progress, setProgress] = useState<ProcessingProgress>({
    total: 0,
    compressed: 0,
    uploaded: 0,
  });

  // Cleanup Object URLs when component unmounts or files change
  useEffect(() => {
    return () => {
      selectedFiles.forEach(file => {
        if (file.preview) {
          URL.revokeObjectURL(file.preview);
        }
      });
    };
  }, [selectedFiles]);

  // Generate unique ID for each file
  const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // Validate file
  const validateFile = (file: File): string | null => {
    const validTypes = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp", "image/heic", "image/heif"];
    const maxSize = 10 * 1024 * 1024; // 10MB

    if (!validTypes.includes(file.type)) {
      return "Invalid file type. Please select valid image files.";
    }

    if (file.size > maxSize) {
      return "File size must be less than 10MB";
    }

    return null;
  };

  // Handle file selection - just add to queue, don't process yet
  const handleFilesSelect = useCallback((files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const newFiles: UploadingFile[] = [];

    for (const file of fileArray) {
      const error = validateFile(file);
      if (error) {
        setError(`${file.name}: ${error}`);
        continue;
      }

      newFiles.push({
        id: generateId(),
        file,
        originalFile: file,
        preview: null,  // Generate later in batches
        status: "queued",
      });
    }

    if (newFiles.length > 0) {
      setSelectedFiles(prev => [...prev, ...newFiles]);
      setProgress(prev => ({ ...prev, total: prev.total + newFiles.length }));
      setError(null);
    }
  }, []);

  // Compress a single file
  const compressFile = async (file: File): Promise<File> => {
    if (file.size <= 1 * 1024 * 1024) {
      // Files < 1MB don't need compression
      return file;
    }

    try {
      const compressed = await imageCompression(file, {
        maxSizeMB: 3,
        maxWidthOrHeight: 4096,
        useWebWorker: true,
        initialQuality: 0.85,
        preserveExif: true, // 保留 EXIF 元数据（时间、地点、相机信息等）
      });

      console.log(
        `Compressed ${file.name}: ${(file.size / 1024 / 1024).toFixed(2)}MB → ${(compressed.size / 1024 / 1024).toFixed(2)}MB`
      );

      return compressed;
    } catch (error) {
      console.error("Compression error:", error);
      return file;  // Return original on error
    }
  };

  // Process files in batches: compress + generate preview
  const processBatch = async (batch: UploadingFile[]) => {
    for (const uploadingFile of batch) {
      if (paused || abortControllerRef.current?.signal.aborted) {
        break;
      }

      // Update status to compressing
      setSelectedFiles(prev =>
        prev.map(f =>
          f.id === uploadingFile.id ? { ...f, status: "compressing" } : f
        )
      );

      try {
        // Compress file
        const compressedFile = await compressFile(uploadingFile.originalFile);

        // Generate Object URL preview (instant, no memory overhead!)
        const previewUrl = URL.createObjectURL(compressedFile);

        // Update to compressed status
        setSelectedFiles(prev =>
          prev.map(f =>
            f.id === uploadingFile.id
              ? {
                  ...f,
                  file: compressedFile,
                  preview: previewUrl,
                  status: "compressed",
                  compressedSize: compressedFile.size,
                }
              : f
          )
        );

        setProgress(prev => ({ ...prev, compressed: prev.compressed + 1 }));
      } catch (error) {
        console.error("Processing error:", error);
        setSelectedFiles(prev =>
          prev.map(f =>
            f.id === uploadingFile.id
              ? {
                  ...f,
                  status: "error",
                  error: "Failed to process",
                }
              : f
          )
        );
      }
    }
  };

  // Process all queued files
  const processAllFiles = async () => {
    const queuedFiles = selectedFiles.filter(f => f.status === "queued");
    if (queuedFiles.length === 0) return;

    setProcessing(true);
    abortControllerRef.current = new AbortController();

    try {
      // Process in batches
      for (let i = 0; i < queuedFiles.length; i += BATCH_SIZE_COMPRESS) {
        if (paused || abortControllerRef.current.signal.aborted) {
          break;
        }

        const batch = queuedFiles.slice(i, i + BATCH_SIZE_COMPRESS);
        await processBatch(batch);
      }
    } finally {
      setProcessing(false);
    }
  };

  // Upload files in batches
  const uploadBatch = async (batch: UploadingFile[]) => {
    const uploadPromises = batch.map(async (uploadingFile) => {
      if (paused || abortControllerRef.current?.signal.aborted) {
        return;
      }

      // Update status to uploading
      setSelectedFiles(prev =>
        prev.map(f =>
          f.id === uploadingFile.id ? { ...f, status: "uploading" } : f
        )
      );

      try {
        const formData = new FormData();
        formData.append("file", uploadingFile.file);

        const response = await fetch("/api/photos", {
          method: "POST",
          body: formData,
          signal: abortControllerRef.current?.signal,
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Failed to upload photo");
        }

        // Update to success
        setSelectedFiles(prev =>
          prev.map(f =>
            f.id === uploadingFile.id ? { ...f, status: "success" } : f
          )
        );

        setProgress(prev => ({ ...prev, uploaded: prev.uploaded + 1 }));
      } catch (err: any) {
        if (err.name === 'AbortError') {
          return;  // Cancelled by user
        }

        setSelectedFiles(prev =>
          prev.map(f =>
            f.id === uploadingFile.id
              ? {
                  ...f,
                  status: "error",
                  error: err instanceof Error ? err.message : "Failed to upload",
                }
              : f
          )
        );
      }
    });

    await Promise.all(uploadPromises);
  };

  // Upload all compressed files
  const uploadAllFiles = async () => {
    const readyFiles = selectedFiles.filter(f => f.status === "compressed");
    if (readyFiles.length === 0) return;

    setUploading(true);
    abortControllerRef.current = new AbortController();

    try {
      // Upload in batches
      for (let i = 0; i < readyFiles.length; i += BATCH_SIZE_UPLOAD) {
        if (paused || abortControllerRef.current.signal.aborted) {
          break;
        }

        const batch = readyFiles.slice(i, i + BATCH_SIZE_UPLOAD);
        await uploadBatch(batch);
      }

      // Check if all uploaded successfully
      const finalFiles = selectedFiles.filter(f => f.status !== "queued" && f.status !== "compressing");
      const allSuccess = finalFiles.every(f => f.status === "success");

      if (allSuccess && finalFiles.length > 0) {
        setTimeout(() => {
          router.push("/gallery");
        }, 1000);
      }
    } finally {
      setUploading(false);
    }
  };

  // Start processing and uploading
  const handleStartUpload = async () => {
    // First, process (compress) all queued files
    await processAllFiles();

    // Then, upload all compressed files
    if (!paused && !abortControllerRef.current?.signal.aborted) {
      await uploadAllFiles();
    }
  };

  // Pause/Resume
  const togglePause = () => {
    setPaused(prev => !prev);
  };

  // Cancel all
  const handleCancel = () => {
    abortControllerRef.current?.abort();
    setProcessing(false);
    setUploading(false);
    setPaused(false);

    // Reset statuses
    setSelectedFiles(prev =>
      prev.map(f => {
        if (f.status === "compressing" || f.status === "uploading") {
          return { ...f, status: "queued" };
        }
        return f;
      })
    );
  };

  // Remove file
  const removeFile = (id: string) => {
    setSelectedFiles(prev => {
      const file = prev.find(f => f.id === id);
      if (file?.preview) {
        URL.revokeObjectURL(file.preview);
      }
      return prev.filter(f => f.id !== id);
    });

    setProgress(prev => {
      const file = selectedFiles.find(f => f.id === id);
      if (!file) return prev;

      return {
        ...prev,
        total: prev.total - 1,
        compressed: file.status === "compressed" || file.status === "success" ? prev.compressed - 1 : prev.compressed,
        uploaded: file.status === "success" ? prev.uploaded - 1 : prev.uploaded,
      };
    });
  };

  // Clear all
  const clearAll = () => {
    selectedFiles.forEach(file => {
      if (file.preview) {
        URL.revokeObjectURL(file.preview);
      }
    });

    setSelectedFiles([]);
    setProgress({ total: 0, compressed: 0, uploaded: 0 });
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
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


  const canStartUpload = selectedFiles.length > 0 && !processing && !uploading;
  const hasQueuedFiles = selectedFiles.some(f => f.status === "queued");
  const hasCompressedFiles = selectedFiles.some(f => f.status === "compressed");

  return (
    <AppLayout>
      <div className="min-h-screen bg-background p-8">
        <div className="max-w-6xl mx-auto">
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
            <h1 className="text-3xl font-bold text-foreground">Upload Photos</h1>
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
                    disabled={processing || uploading}
                    className="px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    Choose Files
                  </button>
                </div>
                <div className="text-sm text-muted-foreground space-y-1">
                  <p>Supported: JPEG, PNG, GIF, WebP, HEIC</p>
                  <p>Max size: 10MB per file</p>
                  <p className="font-medium">✨ Batch processing for hundreds of photos</p>
                  <p className="font-medium">🚀 Auto-compressed with 85% quality</p>
                  <p className="font-medium">⚡ Object URL for minimal memory usage</p>
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

            {/* Progress Bar */}
            {selectedFiles.length > 0 && (
              <div className="bg-card rounded-lg p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-foreground">
                    Selected Files ({selectedFiles.length})
                  </h3>
                  <button
                    onClick={clearAll}
                    disabled={processing || uploading}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                  >
                    Clear All
                  </button>
                </div>

                {/* Progress Statistics */}
                {progress.total > 0 && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>Compressed: {progress.compressed} / {progress.total}</span>
                      <span>Uploaded: {progress.uploaded} / {progress.total}</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2">
                      <div
                        className="bg-primary h-2 rounded-full transition-all duration-300"
                        style={{ width: `${(progress.uploaded / progress.total) * 100}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* File Grid with optimized rendering */}
                <div className="max-h-[500px] overflow-y-auto border rounded-lg">
                  <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 p-3">
                    {selectedFiles.map((uploadingFile) => (
                      <div key={uploadingFile.id} className="relative bg-muted rounded-lg overflow-hidden">
                        {/* Preview Image */}
                        {uploadingFile.preview ? (
                          <div className="relative aspect-square">
                            <Image
                              src={uploadingFile.preview}
                              alt={uploadingFile.file.name}
                              fill
                              className="object-cover"
                              unoptimized  // Object URLs don't need Next.js optimization
                            />
                          </div>
                        ) : (
                          <div className="aspect-square bg-muted flex items-center justify-center">
                            <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
                          </div>
                        )}

                        {/* Status Overlay */}
                        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                          {uploadingFile.status === "queued" && (
                            <button
                              onClick={() => removeFile(uploadingFile.id)}
                              disabled={processing || uploading}
                              className="p-1.5 bg-destructive text-destructive-foreground rounded-full hover:bg-destructive/90 transition-colors disabled:opacity-50"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          )}
                          {uploadingFile.status === "compressing" && (
                            <div className="flex flex-col items-center gap-1">
                              <Loader2 className="w-5 h-5 text-white animate-spin" />
                              <div className="text-white text-xs">Compressing...</div>
                            </div>
                          )}
                          {uploadingFile.status === "compressed" && (
                            <div className="text-white text-xs">Ready</div>
                          )}
                          {uploadingFile.status === "uploading" && (
                            <div className="flex flex-col items-center gap-1">
                              <Loader2 className="w-5 h-5 text-white animate-spin" />
                              <div className="text-white text-xs">Uploading...</div>
                            </div>
                          )}
                          {uploadingFile.status === "success" && (
                            <CheckCircle className="w-6 h-6 text-green-500" />
                          )}
                          {uploadingFile.status === "error" && (
                            <div className="flex flex-col items-center gap-1">
                              <XCircle className="w-6 h-6 text-red-500" />
                              <p className="text-[10px] text-white text-center px-1">
                                {uploadingFile.error}
                              </p>
                            </div>
                          )}
                        </div>

                        {/* File Info */}
                        <div className="absolute bottom-0 left-0 right-0 p-1.5 bg-background/90">
                          <p className="text-[10px] text-foreground truncate leading-tight">
                            {uploadingFile.file.name}
                          </p>
                          <p className="text-[10px] text-muted-foreground leading-tight">
                            {(uploadingFile.file.size / 1024 / 1024).toFixed(2)} MB
                            {uploadingFile.compressedSize && uploadingFile.compressedSize !== uploadingFile.originalFile.size && (
                              <span className="text-green-600 ml-1">
                                → {(uploadingFile.compressedSize / 1024 / 1024).toFixed(2)} MB
                              </span>
                            )}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3">
                  <button
                    onClick={handleStartUpload}
                    disabled={!canStartUpload}
                    className="flex-1 px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {processing
                      ? `Processing ${progress.compressed}/${progress.total}...`
                      : uploading
                      ? `Uploading ${progress.uploaded}/${progress.total}...`
                      : hasQueuedFiles
                      ? `Process & Upload ${selectedFiles.filter(f => f.status === "queued").length} Photos`
                      : hasCompressedFiles
                      ? `Upload ${selectedFiles.filter(f => f.status === "compressed").length} Photos`
                      : "All Done!"}
                  </button>

                  {(processing || uploading) && (
                    <>
                      <button
                        onClick={togglePause}
                        className="px-6 py-3 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/90 transition-colors"
                      >
                        {paused ? (
                          <>
                            <Play className="w-5 h-5 inline mr-2" />
                            Resume
                          </>
                        ) : (
                          <>
                            <Pause className="w-5 h-5 inline mr-2" />
                            Pause
                          </>
                        )}
                      </button>

                      <button
                        onClick={handleCancel}
                        className="px-6 py-3 bg-destructive text-destructive-foreground rounded-lg hover:bg-destructive/90 transition-colors"
                      >
                        Cancel
                      </button>
                    </>
                  )}
                </div>
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
