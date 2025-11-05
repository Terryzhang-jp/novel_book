"use client";

import { useState, useEffect } from "react";
import { Clock } from "lucide-react";
import {
  CLUSTER_THRESHOLD_OPTIONS,
  DEFAULT_CLUSTER_THRESHOLD,
  CLUSTER_THRESHOLD_STORAGE_KEY,
} from "@/lib/utils/photo-clustering";

interface ClusterSettingsProps {
  onChange: (threshold: number) => void;
}

/**
 * 照片聚类阈值设置组件
 *
 * 允许用户选择时间聚类的阈值（10分钟/30分钟/1小时）
 */
export function ClusterSettings({ onChange }: ClusterSettingsProps) {
  const [threshold, setThreshold] = useState(DEFAULT_CLUSTER_THRESHOLD);

  // 从 localStorage 读取保存的阈值
  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(CLUSTER_THRESHOLD_STORAGE_KEY);
      if (saved) {
        const parsedValue = Number.parseInt(saved, 10);
        if (!Number.isNaN(parsedValue)) {
          setThreshold(parsedValue);
          onChange(parsedValue);
        }
      } else {
        // 首次访问，使用默认值
        onChange(DEFAULT_CLUSTER_THRESHOLD);
      }
    }
  }, [onChange]);

  const handleChange = (value: string) => {
    const numValue = Number.parseInt(value, 10);
    setThreshold(numValue);

    // 保存到 localStorage
    if (typeof window !== "undefined") {
      localStorage.setItem(CLUSTER_THRESHOLD_STORAGE_KEY, value);
    }

    // 通知父组件
    onChange(numValue);
  };

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Clock className="w-4 h-4" />
        <span>时间聚类:</span>
      </div>

      <select
        value={threshold}
        onChange={(e) => handleChange(e.target.value)}
        className="px-3 py-1.5 text-sm bg-background border border-border rounded-lg text-foreground hover:bg-accent hover:border-accent-foreground transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
      >
        {CLUSTER_THRESHOLD_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
