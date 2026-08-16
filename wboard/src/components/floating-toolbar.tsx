"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Circle,
  ChevronLeft,
  ChevronRight,
  ChevronUp, // <-- New icon
  ChevronDown, // <-- New icon
  Eraser,
  Grid3X3,
  Minus,
  MousePointer2,
  Moon,
  PenLine,
  RectangleHorizontal,
  Sun,
  Type,
  Undo2,
  ZoomIn,
  ZoomOut,
  BookOpen,
  Download,
  Hand,
} from "lucide-react";

import type { AppTheme, StrokeWidth, Tool } from "@/types/whiteboard";

type FloatingToolbarProps = {
  activeTool: Tool;
  selectedColor: string;
  selectedStrokeWidth: StrokeWidth;
  colorPalette: string[];
  strokeWidthOptions: StrokeWidth[];
  canUndo: boolean;
  canRedo: boolean;
  currentZoom: number;
  appTheme?: AppTheme;
  themeOptions?: AppTheme[];
  showMargins?: boolean;
  collegeMarginMode?: boolean;
  onRedo: () => void;
  onPreviousSlide: () => void;
  onNextSlide: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onSelectColor: (color: string) => void;
  onSelectStrokeWidth: (width: StrokeWidth) => void;
  onToggleGrid: () => void;
  onSetAppTheme?: (theme: AppTheme) => void;
  onToggleMargins?: () => void;
  onToggleCollegeMarginMode?: () => void;
  onToolChange: (tool: Tool) => void;
  onUndo: () => void;
};

const TOOL_ITEMS: {
  label: string;
  tool: Tool;
  icon: any; 
}[] = [
  { label: "Hand (Pan)", tool: "hand", icon: Hand },
  { label: "Select", tool: "select", icon: MousePointer2 },
  { label: "Text", tool: "text", icon: Type },
  { label: "Rectangle", tool: "rectangle", icon: RectangleHorizontal },
  { label: "Circle", tool: "circle", icon: Circle },
  { label: "Arrow", tool: "arrow", icon: ArrowRight },
  { label: "Line", tool: "line", icon: Minus },
  { label: "Pencil", tool: "pencil", icon: PenLine },
  { label: "Eraser", tool: "eraser", icon: Eraser },
  { label: "Area Eraser", tool: "area-eraser", icon: Eraser },
];

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function FloatingToolbar({
  activeTool,
  selectedColor,
  selectedStrokeWidth,
  colorPalette,
  strokeWidthOptions,
  canUndo,
  canRedo,
  currentZoom,
  onRedo,
  onPreviousSlide,
  onNextSlide,
  onZoomIn,
  onZoomOut,
  onSelectColor,
  onSelectStrokeWidth,
  onToggleGrid,
  onToolChange,
  onUndo,
}: FloatingToolbarProps) {
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState({ x: 24, y: 120 });
  const [toolbarWidth, setToolbarWidth] = useState(300);
  const [isMinimized, setIsMinimized] = useState(false); // <-- NEW: Minimize state

  const dragState = useRef<{
    type: "move" | "resize" | null;
    startX: number;
    startY: number;
    initialX: number;
    initialY: number;
    initialWidth: number;
  }>({
    type: null,
    startX: 0,
    startY: 0,
    initialX: 0,
    initialY: 0,
    initialWidth: 300,
  });

  useEffect(() => {
    const handleMove = (event: PointerEvent) => {
      if (!dragState.current.type) return;

      event.preventDefault();

      if (dragState.current.type === "move") {
        const deltaX = event.clientX - dragState.current.startX;
        const deltaY = event.clientY - dragState.current.startY;

        setPosition({
          x: clamp(dragState.current.initialX + deltaX, 8, window.innerWidth - toolbarWidth - 8),
          y: clamp(dragState.current.initialY + deltaY, 8, window.innerHeight - 8),
        });
      } else {
        const deltaWidth = event.clientX - dragState.current.startX;
        setToolbarWidth(clamp(dragState.current.initialWidth + deltaWidth, 260, 420));
      }
    };

    const handleUp = () => {
      dragState.current.type = null;
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);

    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [toolbarWidth]);

  const startMove = (event: React.PointerEvent<HTMLDivElement>) => {
    dragState.current = {
      type: "move",
      startX: event.clientX,
      startY: event.clientY,
      initialX: position.x,
      initialY: position.y,
      initialWidth: toolbarWidth,
    };
  };

  const startResize = (event: React.PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    dragState.current = {
      type: "resize",
      startX: event.clientX,
      startY: event.clientY,
      initialX: position.x,
      initialY: position.y,
      initialWidth: toolbarWidth,
    };
  };

  const handleExportPNG = () => {
    const canvas = document.querySelector('.konvajs-content canvas') as HTMLCanvasElement;
    
    if (!canvas) {
      console.error("Could not find the whiteboard canvas to export.");
      return;
    }

    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const ctx = tempCanvas.getContext("2d");

    if (ctx) {
      ctx.fillStyle = "#f7f4ec"; 
      ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
      ctx.drawImage(canvas, 0, 0);
    }

    const dataUrl = tempCanvas.toDataURL("image/png");
    const link = document.createElement("a");
    
    link.download = `wboard-export-${new Date().toISOString().split('T')[0]}.png`;
    link.href = dataUrl;
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <aside
      ref={toolbarRef}
      className="fixed z-30 rounded-3xl border border-slate-200/80 bg-white/95 shadow-[0_20px_50px_rgba(15,23,42,0.16)] backdrop-blur"
      style={{ left: position.x, top: position.y, width: toolbarWidth }}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
    >
      <div
        className="flex cursor-grab items-center justify-between gap-3 rounded-t-3xl border-b border-slate-200/80 bg-slate-50 px-3 py-2"
        onPointerDown={startMove}
      >
        <div className="flex items-center gap-2">
          {/* --- NEW: Minimize Toggle Button --- */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation(); // Prevents triggering the drag event
              setIsMinimized(!isMinimized);
            }}
            className="rounded-full p-1 text-slate-400 transition hover:bg-slate-200 hover:text-slate-700"
            aria-label="Toggle toolbar visibility"
          >
            {isMinimized ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </button>
          <span className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-600">Toolbar</span>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onPreviousSlide}
            className="rounded-2xl bg-white/95 p-2 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
            aria-label="Previous slide"
            title="Previous slide"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onNextSlide}
            className="rounded-2xl bg-white/95 p-2 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
            aria-label="Next slide"
            title="Next slide"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* --- NEW: Hide the content when minimized --- */}
      {!isMinimized && (
        <>
          <div className="flex flex-col gap-3 p-3">
            <div className="grid grid-cols-3 gap-2">
              {TOOL_ITEMS.map(({ label, tool, icon: Icon }) => {
                const isActive = activeTool === tool;
                return (
                  <button
                    key={tool}
                    type="button"
                    onClick={() => onToolChange(tool)}
                    className={[
                      "flex h-11 items-center justify-center rounded-2xl border transition",
                      isActive
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-transparent bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900",
                    ].join(" ")}
                    aria-label={label}
                    title={label}
                  >
                    <Icon className="h-4.5 w-4.5" strokeWidth={2.1} />
                  </button>
                );
              })}
            </div>

            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-3">
              <div className="mb-2 text-sm font-semibold text-slate-800">Brush</div>
              <div className="flex flex-wrap items-center gap-2">
                {colorPalette.map((color) => {
                  const isActive = selectedColor === color;
                  return (
                    <button
                      key={color}
                      type="button"
                      onClick={() => onSelectColor(color)}
                      className={[
                        "h-7 w-7 rounded-full border-2 transition",
                        isActive
                          ? "scale-105 border-slate-900 shadow-[0_0_0_2px_rgba(255,255,255,0.95)]"
                          : "border-white hover:scale-105",
                      ].join(" ")}
                      style={{ backgroundColor: color }}
                      aria-label={`Select ${color} color`}
                      title={color}
                    />
                  );
                })}
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {strokeWidthOptions.map((widthOption) => {
                  const isActive = selectedStrokeWidth === widthOption;
                  return (
                    <button
                      key={widthOption}
                      type="button"
                      onClick={() => onSelectStrokeWidth(widthOption)}
                      className={[
                        "flex h-11 items-center justify-center rounded-2xl border transition",
                        isActive
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-transparent bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900",
                      ].join(" ")}
                      aria-label={`Set stroke width to ${widthOption}px`}
                      title={`${widthOption}px`}
                    >
                      <span
                        className={isActive ? "bg-white" : "bg-current"}
                        style={{
                          width: 18,
                          height: widthOption,
                          borderRadius: 999,
                        }}
                      />
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={onUndo}
                disabled={!canUndo}
                className="flex h-11 items-center justify-center rounded-2xl border border-transparent bg-slate-100 text-slate-600 transition hover:bg-slate-200 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Undo"
                title="Undo"
              >
                <Undo2 className="h-4.5 w-4.5" />
              </button>

              <button
                type="button"
                onClick={onRedo}
                disabled={!canRedo}
                className="flex h-11 items-center justify-center rounded-2xl border border-transparent bg-slate-100 text-slate-600 transition hover:bg-slate-200 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Redo"
                title="Redo"
              >
                <ArrowRight className="h-4.5 w-4.5" />
              </button>

              <button
                type="button"
                onClick={handleExportPNG}
                className="flex h-11 items-center justify-center rounded-2xl border border-transparent bg-slate-100 text-slate-600 transition hover:bg-slate-200 hover:text-slate-900"
                aria-label="Export as PNG"
                title="Export as PNG"
              >
                <Download className="h-4.5 w-4.5" />
              </button>
            </div>

            <div className="grid grid-cols-4 gap-2">
              <button
                type="button"
                onClick={onZoomOut}
                className="flex h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
                aria-label="Zoom out"
                title="Zoom out"
              >
                <ZoomOut className="h-4.5 w-4.5" />
              </button>
              <div className="flex items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700">
                <span className="text-sm font-semibold">{Math.round(currentZoom * 100)}%</span>
              </div>
              <button
                type="button"
                onClick={onZoomIn}
                className="flex h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
                aria-label="Zoom in"
                title="Zoom in"
              >
                <ZoomIn className="h-4.5 w-4.5" />
              </button>
              <button
                type="button"
                onClick={onToggleGrid}
                className="flex h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
                aria-label="Toggle grid"
                title="Toggle grid"
              >
                <Grid3X3 className="h-4.5 w-4.5" />
              </button>
            </div>
          </div>

          <div
            className="absolute bottom-2 right-2 h-4 w-4 cursor-se-resize rounded-full bg-slate-200 shadow-inner"
            onPointerDown={startResize}
          />
        </>
      )}
    </aside>
  );
}