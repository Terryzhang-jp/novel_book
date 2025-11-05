import type { Photo } from "@/types/storage";

/**
 * 照片聚类结果
 */
export interface PhotoCluster {
  id: string;
  startTime: string | null; // null 表示无时间信息的组
  endTime: string | null;
  photos: Photo[];
  isBurst: boolean; // 是否为连拍
  displayTitle: string;
}

/**
 * 基于时间间隔的照片聚类算法
 *
 * @param photos 待聚类的照片列表
 * @param thresholdMinutes 时间阈值（分钟）：10 / 30 / 60
 * @param burstThresholdSeconds 连拍判断阈值（秒），默认60秒
 * @returns 聚类结果数组
 */
export function clusterPhotosByTime(
  photos: Photo[],
  thresholdMinutes: number,
  burstThresholdSeconds: number = 60
): PhotoCluster[] {
  if (photos.length === 0) {
    return [];
  }

  // 1. 分离有时间和无时间的照片
  const withTime = photos.filter((p) => p.metadata?.dateTime);
  const withoutTime = photos.filter((p) => !p.metadata?.dateTime);

  // 2. 按时间排序（降序：最新的在前）
  const sorted = withTime.sort((a, b) => {
    const timeA = new Date(a.metadata.dateTime!).getTime();
    const timeB = new Date(b.metadata.dateTime!).getTime();
    return timeB - timeA; // 降序
  });

  // 3. 基于时间间隔分组
  const clusters: PhotoCluster[] = [];

  if (sorted.length > 0) {
    let currentGroup: Photo[] = [sorted[0]];

    for (let i = 1; i < sorted.length; i++) {
      const gapMinutes = getMinutesDifference(
        sorted[i].metadata.dateTime!,
        sorted[i - 1].metadata.dateTime!
      );

      if (gapMinutes > thresholdMinutes) {
        // 超过阈值 → 创建新cluster
        clusters.push(buildCluster(currentGroup, burstThresholdSeconds));
        currentGroup = [sorted[i]];
      } else {
        currentGroup.push(sorted[i]);
      }
    }

    // 添加最后一组
    clusters.push(buildCluster(currentGroup, burstThresholdSeconds));
  }

  // 4. 添加无时间信息的照片组（如果有）
  if (withoutTime.length > 0) {
    clusters.push(buildUnclusteredGroup(withoutTime));
  }

  return clusters;
}

/**
 * 计算两个时间戳之间的分钟差（绝对值）
 */
function getMinutesDifference(time1: string, time2: string): number {
  const ms1 = new Date(time1).getTime();
  const ms2 = new Date(time2).getTime();
  return Math.abs(ms2 - ms1) / 1000 / 60;
}

/**
 * 构建一个聚类组
 */
function buildCluster(
  photos: Photo[],
  burstThresholdSeconds: number
): PhotoCluster {
  // 按时间排序（升序，用于确定startTime和endTime）
  const sorted = photos.sort((a, b) => {
    const timeA = new Date(a.metadata.dateTime!).getTime();
    const timeB = new Date(b.metadata.dateTime!).getTime();
    return timeA - timeB;
  });

  const startTime = sorted[0].metadata.dateTime!;
  const endTime = sorted[sorted.length - 1].metadata.dateTime!;

  // 计算时间跨度（秒）
  const durationSeconds =
    (new Date(endTime).getTime() - new Date(startTime).getTime()) / 1000;

  // 连拍判断：时间跨度 ≤ burstThresholdSeconds 且 照片数量 ≥ 3
  const isBurst = durationSeconds <= burstThresholdSeconds && photos.length >= 3;

  return {
    id: generateClusterId(startTime, photos.length),
    startTime,
    endTime,
    photos,
    isBurst,
    displayTitle: formatClusterTitle(startTime, endTime, photos.length, isBurst),
  };
}

/**
 * 构建无时间信息的照片组
 */
function buildUnclusteredGroup(photos: Photo[]): PhotoCluster {
  return {
    id: "unclustered",
    startTime: null,
    endTime: null,
    photos,
    isBurst: false,
    displayTitle: `未分组照片（无时间信息·${photos.length}张）`,
  };
}

/**
 * 生成聚类组ID
 */
function generateClusterId(startTime: string, photoCount: number): string {
  const timestamp = new Date(startTime).getTime();
  return `cluster-${timestamp}-${photoCount}`;
}

/**
 * 格式化聚类标题
 *
 * 示例输出：
 * - "2024年3月15日 08:20-08:22（连拍·5张）"
 * - "2024年3月15日 14:30-15:45（12张）"
 * - "2024年3月15日 09:15（1张）"
 */
function formatClusterTitle(
  startTime: string,
  endTime: string,
  photoCount: number,
  isBurst: boolean
): string {
  const start = new Date(startTime);
  const end = new Date(endTime);

  // 日期部分
  const date = start.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // 时间部分
  const timeStart = start.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const timeEnd = end.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  // 如果是同一时间（单张或连拍在同一分钟内）
  const timeRange = timeStart === timeEnd ? timeStart : `${timeStart}-${timeEnd}`;

  // 连拍标记
  const burstLabel = isBurst ? "连拍·" : "";

  return `${date} ${timeRange}（${burstLabel}${photoCount}张）`;
}

/**
 * 默认阈值配置（分钟）
 */
export const CLUSTER_THRESHOLD_OPTIONS = [
  { label: "10分钟", value: 10 },
  { label: "30分钟", value: 30 },
  { label: "1小时", value: 60 },
] as const;

/**
 * 默认阈值
 */
export const DEFAULT_CLUSTER_THRESHOLD = 30;

/**
 * LocalStorage key
 */
export const CLUSTER_THRESHOLD_STORAGE_KEY = "photo-cluster-threshold";
