"use client";

import { Calendar, Camera, MapPin } from "lucide-react";
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

  // 解析时间
  const dateObj = cluster.startTime ? new Date(cluster.startTime) : null;
  const day = dateObj ? dateObj.getDate() : "";
  const month = dateObj ? dateObj.toLocaleDateString("en-US", { month: "short" }).toUpperCase() : "";
  const year = dateObj ? dateObj.getFullYear() : "";
  const weekDay = dateObj ? dateObj.toLocaleDateString("en-US", { weekday: "long" }) : "";

  // 提取地点信息（简单取第一张有地点的照片）
  const locationPhoto = cluster.photos.find(p => p.metadata?.location);
  const locationName = locationPhoto?.metadata?.location ?
    `${locationPhoto.metadata.location.latitude.toFixed(2)}°, ${locationPhoto.metadata.location.longitude.toFixed(2)}°` : null;

  return (
    <div className="mb-16">
      {/* 杂志化标题 */}
      <div className="mb-8 flex items-end gap-4 border-b border-border/40 pb-4">
        {isUnclustered ? (
          <div className="flex items-center gap-3 text-muted-foreground">
            <Camera className="w-8 h-8" />
            <h3 className="text-2xl font-light tracking-wide">Unclustered</h3>
          </div>
        ) : (
          <>
            {/* 左侧：巨大的日期数字 */}
            <div className="text-6xl font-bold text-foreground leading-none tracking-tighter">
              {day}
            </div>

            {/* 中间：竖排月份和年份 */}
            <div className="flex flex-col justify-center h-full pb-1">
              <span className="text-sm font-bold text-primary tracking-widest uppercase leading-none mb-1">
                {month}
              </span>
              <span className="text-sm font-light text-muted-foreground tracking-widest leading-none">
                {year}
              </span>
            </div>

            {/* 分隔竖线 */}
            <div className="w-px h-10 bg-border/60 mx-2 self-center" />

            {/* 右侧：星期和地点 */}
            <div className="flex flex-col justify-center h-full pb-1">
              <span className="text-lg font-medium text-foreground tracking-wide leading-none mb-1">
                {weekDay}
              </span>
              <div className="flex items-center gap-1 text-xs text-muted-foreground font-light tracking-wide">
                {locationName && <MapPin className="w-3 h-3" />}
                <span>{locationName || `${cluster.photos.length} Photos`}</span>
                {cluster.isBurst && <span className="ml-2 px-1.5 py-0.5 bg-primary/10 text-primary rounded text-[10px] font-bold uppercase">Burst</span>}
              </div>
            </div>
          </>
        )}
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
