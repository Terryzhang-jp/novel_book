"use client";

import { Calendar, Camera } from "lucide-react";
import type { PhotoCluster } from "@/lib/utils/photo-clustering";
import { PhotoGrid } from "./photo-grid";

interface ClusterSectionProps {
  cluster: PhotoCluster;
  userId: string;
  onPhotoDelete?: (photoId: string) => void;
  selectionMode?: boolean;
  selectedPhotos?: Set<string>;
  onPhotoToggle?: (photoId: string) => void;
  onPhotoClick?: (photoId: string) => void;
}

/**
 * 照片聚类分组展示组件
 *
 * 显示一个时间聚类组，包含：
 * - 标题（日期、时间范围、照片数量、连拍标记）
 * - 照片网格
 */
export function ClusterSection({
  cluster,
  userId,
  onPhotoDelete,
  selectionMode,
  selectedPhotos,
  onPhotoToggle,
  onPhotoClick,
}: ClusterSectionProps) {
  // 判断是否为无时间信息组
  const isUnclustered = cluster.startTime === null;

  return (
    <div className="mb-12">
      {/* 聚类标题 */}
      <div className="mb-4 flex items-center gap-2">
        {isUnclustered ? (
          <Camera className="w-5 h-5 text-muted-foreground flex-shrink-0" />
        ) : (
          <Calendar className="w-5 h-5 text-primary flex-shrink-0" />
        )}
        <h3
          className={`text-lg font-semibold ${
            isUnclustered ? "text-muted-foreground" : "text-foreground"
          }`}
        >
          {cluster.displayTitle}
        </h3>
      </div>

      {/* 照片网格 */}
      <PhotoGrid
        photos={cluster.photos}
        userId={userId}
        onPhotoDelete={onPhotoDelete}
        selectionMode={selectionMode}
        selectedPhotos={selectedPhotos}
        onPhotoToggle={onPhotoToggle}
        onPhotoClick={onPhotoClick}
      />
    </div>
  );
}
