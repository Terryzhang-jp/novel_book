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

  // Calculate percentage for gradient background
  // For -100 to 100 range: 0 is 50%
  const range = max - min;
  const percentage = ((value - min) / range) * 100;
  const zeroPercentage = ((0 - min) / range) * 100;

  const isModified = value !== 0;

  return (
    <div className="group">
      {/* Label and Value Row */}
      <div className="flex items-center justify-between mb-3">
        <label className={`text-[11px] font-medium tracking-wider uppercase transition-colors ${isModified ? "text-white" : "text-zinc-500 group-hover:text-zinc-400"
          }`}>
          {label}
        </label>
        <span className={`text-[11px] font-mono tabular-nums transition-colors ${isModified ? "text-white" : "text-zinc-600 group-hover:text-zinc-500"
          }`}>
          {value > 0 ? "+" : ""}{value}{unit}
        </span>
      </div>

      {/* Slider Container */}
      <div className="relative h-4 flex items-center">
        {/* Track Background */}
        <div className="absolute w-full h-[2px] bg-zinc-800 rounded-full overflow-hidden">
          {/* Active Track Segment */}
          <div
            className="absolute h-full bg-white transition-all duration-75 ease-out"
            style={{
              left: value >= 0 ? `${zeroPercentage}%` : `${percentage}%`,
              width: `${Math.abs(percentage - zeroPercentage)}%`,
              opacity: isModified ? 1 : 0
            }}
          />
        </div>

        {/* Center Marker */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[2px] h-[2px] bg-zinc-600 rounded-full" />

        {/* Input Range */}
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
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
        />

        {/* Custom Thumb (Visual Only) */}
        <div
          className={`absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-lg pointer-events-none transition-transform duration-100 ease-out ${isDragging ? "scale-125" : "scale-100 group-hover:scale-110"
            }`}
          style={{
            left: `${percentage}%`,
            transform: `translate(-50%, -50%) ${isDragging ? "scale(1.25)" : "scale(1)"}`,
            opacity: isModified || isDragging ? 1 : 0.5
          }}
        />
      </div>
    </div>
  );
}
