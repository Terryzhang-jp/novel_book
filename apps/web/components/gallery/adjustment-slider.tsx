"use client";

import { useState } from "react";

interface AdjustmentSliderProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
}

export function AdjustmentSlider({
  label,
  value,
  onChange,
  min = -100,
  max = 100,
  step = 1,
  unit = "",
}: AdjustmentSliderProps) {
  const [isDragging, setIsDragging] = useState(false);

  const percentage = ((value - min) / (max - min)) * 100;
  const isModified = value !== 0;

  return (
    <div className="space-y-2">
      {/* 标签和数值 */}
      <div className="flex items-center justify-between">
        <label className={`text-sm font-medium transition-colors ${
          isModified ? "text-gray-900" : "text-gray-600"
        }`}>
          {label}
        </label>
        <span className={`text-sm font-mono tabular-nums transition-colors ${
          isModified ? "text-blue-600 font-semibold" : "text-gray-500"
        }`}>
          {value > 0 ? "+" : ""}{value}{unit}
        </span>
      </div>

      {/* 滑块 */}
      <div className="relative">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          onMouseDown={() => setIsDragging(true)}
          onMouseUp={() => setIsDragging(false)}
          onTouchStart={() => setIsDragging(true)}
          onTouchEnd={() => setIsDragging(false)}
          className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer transition-all slider-custom"
          style={{
            background: isModified
              ? `linear-gradient(to right,
                  #e5e7eb 0%,
                  #e5e7eb ${percentage}%,
                  #60a5fa ${percentage}%,
                  #60a5fa ${percentage}%,
                  #e5e7eb ${percentage}%,
                  #e5e7eb 100%)`
              : `#e5e7eb`,
          }}
        />

        {/* 中心标记线 */}
        {min < 0 && max > 0 && (
          <div
            className="absolute top-1/2 -translate-y-1/2 w-0.5 h-3 bg-gray-300 pointer-events-none"
            style={{ left: `${((0 - min) / (max - min)) * 100}%` }}
          />
        )}
      </div>

      {/* 重置按钮（仅在修改时显示） */}
      {isModified && (
        <button
          onClick={() => onChange(0)}
          className="text-xs text-blue-600 hover:text-blue-700 font-medium transition-colors"
        >
          重置
        </button>
      )}

      <style jsx>{`
        .slider-custom::-webkit-slider-thumb {
          appearance: none;
          width: 18px;
          height: 18px;
          background: ${isModified || isDragging ? "#2563eb" : "#6b7280"};
          border: 2px solid white;
          border-radius: 50%;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .slider-custom::-webkit-slider-thumb:hover {
          transform: scale(1.1);
          background: #2563eb;
        }

        .slider-custom::-webkit-slider-thumb:active {
          transform: scale(0.95);
        }

        .slider-custom::-moz-range-thumb {
          width: 18px;
          height: 18px;
          background: ${isModified || isDragging ? "#2563eb" : "#6b7280"};
          border: 2px solid white;
          border-radius: 50%;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .slider-custom::-moz-range-thumb:hover {
          transform: scale(1.1);
          background: #2563eb;
        }

        .slider-custom::-moz-range-thumb:active {
          transform: scale(0.95);
        }
      `}</style>
    </div>
  );
}
