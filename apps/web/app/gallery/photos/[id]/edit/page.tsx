"use client";

import { use, useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

// Dynamic import to avoid SSR issues with TOAST UI Image Editor
const PhotoEditor = dynamic(
  () => import("@/components/gallery/professional-photo-editor").then((mod) => ({ default: mod.ProfessionalPhotoEditor })),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-screen bg-white">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-600 font-medium">加载编辑器...</p>
        </div>
      </div>
    ),
  }
);

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function PhotoEditPage({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load photo data
  useEffect(() => {
    const loadPhoto = async () => {
      try {
        const response = await fetch(`/api/photos/${id}`);
        if (!response.ok) {
          throw new Error("Failed to load photo");
        }
        const data = await response.json();
        // API returns { photo: Photo } structure
        const photoData = data.photo || data;

        // 使用优化后的图片URL用于编辑器
        // 优点：减少带宽和内存占用，加快加载速度
        const optimizedUrl = `/api/photos/${id}/optimized`;
        setImageUrl(optimizedUrl);

        console.log(`[PhotoEditPage] Using optimized image URL for editing`);
      } catch (err) {
        console.error("Failed to load photo:", err);
        setError("无法加载照片");
      } finally {
        setIsLoading(false);
      }
    };

    if (id) {
      loadPhoto();
    }
  }, [id]);

  const handleSave = async (blob: Blob) => {
    try {
      // 创建 FormData
      const formData = new FormData();
      formData.append("file", blob, "edited-photo.jpg");

      // 上传编辑后的照片
      const response = await fetch(`/api/photos/${id}/edit`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Failed to save edited photo");
      }

      // 返回 gallery 页面
      router.push("/gallery");
      router.refresh();
    } catch (err) {
      console.error("Failed to save edited photo:", err);
      throw err; // Re-throw to let PhotoEditor handle the error display
    }
  };

  const handleCancel = () => {
    router.back();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-white">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          <p className="text-sm text-gray-600">加载照片...</p>
        </div>
      </div>
    );
  }

  if (error || !imageUrl) {
    return (
      <div className="flex items-center justify-center h-screen bg-white">
        <div className="flex flex-col items-center gap-4">
          <p className="text-red-600">{error || "照片不存在"}</p>
          <button
            onClick={() => router.back()}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
          >
            返回
          </button>
        </div>
      </div>
    );
  }

  return (
    <PhotoEditor
      photoId={id}
      imageUrl={imageUrl}
      onSave={handleSave}
      onCancel={handleCancel}
    />
  );
}
