"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { KonvaEventObject } from "konva/lib/Node";
import type { Node as KonvaNode } from "konva/lib/Node";
import type { Stage as KonvaStage } from "konva/lib/Stage";
import type { Transformer as KonvaTransformer } from "konva/lib/shapes/Transformer";
import {
  Arrow,
  Ellipse,
  Group,
  Layer,
  Line,
  Rect,
  Stage,
  Text,
  Transformer,
} from "react-konva";
import { v4 as uuidv4 } from "uuid";

import { FloatingToolbar } from "@/components/floating-toolbar";
import { SlideDock } from "@/components/slide-dock";
import { useWhiteboardStore } from "@/store/use-whiteboard-store";
import { useSocket } from "@/components/socket-provider";
import type { Tool, WhiteboardShape, Page } from "@/types/whiteboard";

type Point = { x: number; y: number };
type Rectangle = { x: number; y: number; width: number; height: number };

type CursorData = { x: number; y: number; name: string; color: string; pageId?: string };

const SLIDE_WIDTH = 1280;
const SLIDE_HEIGHT = 720;
const DEFAULT_TEXT = "Type here";
const MIN_ZOOM = 0.6;
const MAX_ZOOM = 1.4;
const ZOOM_STEP = 0.1;

const CURSOR_COLORS = ["#ef4444", "#eab308", "#22c55e", "#06b6d4", "#3b82f6", "#a855f7", "#ec4899"];

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function shapeBounds(shape: WhiteboardShape): Rectangle {
  if (shape.type === "circle") return { x: shape.x, y: shape.y, width: shape.width, height: shape.height };
  if (shape.type === "line" || shape.type === "arrow" || shape.type === "pencil") {
    const points = shape.points ?? [];
    const xs = points.filter((_, index) => index % 2 === 0);
    const ys = points.filter((_, index) => index % 2 === 1);
    const minX = Math.min(...xs, 0);
    const minY = Math.min(...ys, 0);
    const maxX = Math.max(...xs, 0);
    const maxY = Math.max(...ys, 0);
    return { x: shape.x + minX, y: shape.y + minY, width: maxX - minX, height: maxY - minY };
  }
  return { x: shape.x, y: shape.y, width: shape.width, height: shape.height };
}

function intersectsRectangle(a: Rectangle, b: Rectangle) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function hasVisibleGeometry(shape: WhiteboardShape) {
  if (shape.type === "text") return Boolean(shape.text?.trim());
  if (shape.type === "pencil") return (shape.points?.length ?? 0) > 2;
  if (shape.type === "line" || shape.type === "arrow") return Math.abs(shape.points?.[2] ?? 0) > 2 || Math.abs(shape.points?.[3] ?? 0) > 2;
  return shape.width > 12 || shape.height > 12;
}

function getMarginGuideColor(appTheme: string, collegeMode: boolean): string {
  if (collegeMode) return "#dc2626";
  if (appTheme === "midnight") return "rgba(100, 116, 139, 0.3)";
  if (appTheme === "sunny") return "rgba(148, 163, 184, 0.3)";
  return "rgba(203, 213, 225, 0.4)";
}

export default function Whiteboard() {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<KonvaStage | null>(null);
  const transformerRef = useRef<KonvaTransformer | null>(null);
  const shapeRefs = useRef<Record<string, KonvaNode | null>>({});
  const lastCursorUpdate = useRef<number>(0);
  
  const socket = useSocket();

  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);
  const [draftShapeId, setDraftShapeId] = useState<string | null>(null);
  const [draftOrigin, setDraftOrigin] = useState<Point | null>(null);
  const [selectionBox, setSelectionBox] = useState<Rectangle | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [zoom, setZoom] = useState(0.8);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [textValue, setTextValue] = useState<string>("");
  const [textInputStyle, setTextInputStyle] = useState<CSSProperties>({ display: "none" });
  const [cursors, setCursors] = useState<Record<string, CursorData>>({});

  const currentUser = useWhiteboardStore((state) => state.currentUser);
  const pages = useWhiteboardStore((state) => state.pages);
  const activePageId = useWhiteboardStore((state) => state.activePageId);
  const activeTool = useWhiteboardStore((state) => state.activeTool);
  const selectedColor = useWhiteboardStore((state) => state.selectedColor);
  const selectedStrokeWidth = useWhiteboardStore((state) => state.selectedStrokeWidth);
  const colorPalette = useWhiteboardStore((state) => state.colorPalette);
  const strokeWidthOptions = useWhiteboardStore((state) => state.strokeWidthOptions);
  const isGridVisible = useWhiteboardStore((state) => state.isGridVisible);
  const appTheme = useWhiteboardStore((state) => state.appTheme);
  const showMargins = useWhiteboardStore((state) => state.showMargins);
  const collegeMarginMode = useWhiteboardStore((state) => state.collegeMarginMode);
  const pastCount = useWhiteboardStore((state) => state.past.length);
  const futureCount = useWhiteboardStore((state) => state.future.length);
  
  const setActiveTool = useWhiteboardStore((state) => state.setActiveTool);
  const setSelectedColor = useWhiteboardStore((state) => state.setSelectedColor);
  const setSelectedStrokeWidth = useWhiteboardStore((state) => state.setSelectedStrokeWidth);
  const toggleGrid = useWhiteboardStore((state) => state.toggleGrid);
  
  const createPage = useWhiteboardStore((state) => state.createPage);
  const addPage = useWhiteboardStore((state) => state.addPage);
  const deletePage = useWhiteboardStore((state) => state.deletePage);
  const renamePage = useWhiteboardStore((state) => state.renamePage);
  const setActivePage = useWhiteboardStore((state) => state.setActivePage);
  
  const addShape = useWhiteboardStore((state) => state.addShape);
  const updateShape = useWhiteboardStore((state) => state.updateShape);
  const removeShape = useWhiteboardStore((state) => state.removeShape);
  const removeShapes = useWhiteboardStore((state) => state.removeShapes);
  const undo = useWhiteboardStore((state) => state.undo);
  const redo = useWhiteboardStore((state) => state.redo);

  const currentPage = pages.find((page) => page.id === activePageId) ?? pages[0] ?? null;
  const shapes = useMemo(() => currentPage?.content.shapes ?? [], [currentPage?.content.shapes]);
  const activeSelectedShapeId = shapes.some((shape) => shape.id === selectedShapeId) ? selectedShapeId : null;
  const currentPageIndex = pages.findIndex((page) => page.id === activePageId);

  const slidePosition = useMemo(
    () => ({
      x: Math.max((stageSize.width - SLIDE_WIDTH * zoom) / 2, 24),
      y: Math.max((stageSize.height - SLIDE_HEIGHT * zoom) / 2, 24),
    }),
    [stageSize, zoom],
  );

  useEffect(() => {
    if (!socket) return;

    socket.on("shape:add", (data: any) => {
      if(data?.shape) addShape(data.shape, { trackHistory: false, pageId: data.pageId });
    });

    socket.on("shape:update", (data: any) => {
      if(data?.id && data?.updates) updateShape(data.id, data.updates, { trackHistory: false, pageId: data.pageId });
    });

    socket.on("shape:delete", (data: any) => {
      if(data?.id) removeShape(data.id, { trackHistory: false, pageId: data.pageId });
    });

    socket.on("shape:delete_multiple", (data: any) => {
      if(data?.ids) removeShapes(data.ids, { trackHistory: false, pageId: data.pageId });
    });

    socket.on("cursor:update", (data: { id: string; name: string; x: number; y: number; pageId: string }) => {
      setCursors((prev) => ({
        ...prev,
        [data.id]: { x: data.x, y: data.y, name: data.name, color: CURSOR_COLORS[data.id.charCodeAt(0) % CURSOR_COLORS.length], pageId: data.pageId },
      }));
    });

    socket.on("cursor:remove", (id: string) => {
      setCursors((prev) => { const next = { ...prev }; delete next[id]; return next; });
    });

    socket.on("page:add", (page: Page) => addPage(page));
    socket.on("page:delete", (id: string) => deletePage(id));
    socket.on("page:rename", (data: { id: string; name: string }) => renamePage(data.id, data.name));

    // --- CATCH-UP PROTOCOL LISTENERS ---
    socket.on("room-state", (incomingPages: Page[]) => {
      // We are the new user. Update our store with the existing room data.
      useWhiteboardStore.getState().setPages(incomingPages);
    });

    socket.on("request-sync", ({ targetSocketId }: { targetSocketId: string }) => {
      // We are the existing user. The server wants us to send our data to the new guy.
      const currentPages = useWhiteboardStore.getState().pages;
      socket.emit("send-sync", { targetSocketId, pages: currentPages });
    });

    return () => {
      socket.off("shape:add");
      socket.off("shape:update");
      socket.off("shape:delete");
      socket.off("shape:delete_multiple");
      socket.off("cursor:update");
      socket.off("cursor:remove");
      socket.off("page:add");
      socket.off("page:delete");
      socket.off("page:rename");
      socket.off("room-state");
      socket.off("request-sync");
    };
  }, [socket, addShape, updateShape, removeShape, removeShapes, addPage, deletePage, renamePage]);

  function resetInteractionState() {
    setSelectedShapeId(null);
    setDraftShapeId(null);
    setDraftOrigin(null);
    setSelectionBox(null);
    setIsDrawing(false);
    setEditingTextId(null);
  }

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const syncStageSize = () => setStageSize({ width: container.clientWidth, height: container.clientHeight });
    syncStageSize();
    const observer = new ResizeObserver(syncStageSize);
    observer.observe(container);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!transformerRef.current || !activeSelectedShapeId) return;
    const selectedNode = shapeRefs.current[activeSelectedShapeId];
    if (!selectedNode) return;
    transformerRef.current.nodes([selectedNode]);
    transformerRef.current.getLayer()?.batchDraw();
  }, [activeSelectedShapeId, shapes.length]);

  useEffect(() => {
    const shape = editingTextId ? shapes.find((item) => item.id === editingTextId) : null;
    if (!shape || !containerRef.current) {
      setTextInputStyle({ display: "none" });
      return;
    }

    const left = slidePosition.x + shape.x * zoom;
    const top = slidePosition.y + shape.y * zoom;
    const width = Math.max(shape.width * zoom, 180);
    const height = Math.max(shape.height * zoom, 48);

    setTextInputStyle({
      position: "absolute", left, top, width, minHeight: height,
      padding: "12px 14px", borderRadius: "18px", border: "1px solid rgba(148,163,184,0.5)",
      background: "rgba(255,255,255,0.97)", boxShadow: "0 16px 40px rgba(15,23,42,0.12)",
      fontSize: 16, lineHeight: 1.4, color: shape.stroke, outline: "none", resize: "none",
      zIndex: 40, display: "block",
    });
  }, [editingTextId, shapes, slidePosition, zoom]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return;

      const isUndo = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z";
      const isRedo = (event.ctrlKey || event.metaKey) && (event.key.toLowerCase() === "y" || (event.shiftKey && event.key.toLowerCase() === "z"));

      if (isUndo) { event.preventDefault(); undo(); }
      if (isRedo) { event.preventDefault(); redo(); }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [redo, undo]);

  function getPointerPosition(event: KonvaEventObject<MouseEvent | TouchEvent>): Point | null {
    const stage = event.target.getStage();
    const position = stage?.getPointerPosition();
    if (!position) return null;
    return { x: position.x, y: position.y };
  }

  function toSlidePoint(stagePoint: Point): Point {
    return { x: (stagePoint.x - slidePosition.x) / zoom, y: (stagePoint.y - slidePosition.y) / zoom };
  }

  function isPointInSlide(point: Point) {
    return point.x >= 0 && point.x <= SLIDE_WIDTH && point.y >= 0 && point.y <= SLIDE_HEIGHT;
  }

  function buildShape(tool: Tool, point: Point): WhiteboardShape | null {
    if (tool === "select" || tool === "eraser" || tool === "area-eraser") return null;
    if (tool === "text") {
      return { id: uuidv4(), type: "text", x: point.x, y: point.y, width: 280, height: 80, stroke: selectedColor, strokeWidth: selectedStrokeWidth, text: "" };
    }
    return {
      id: uuidv4(), type: tool, x: point.x, y: point.y, width: 0, height: 0, stroke: selectedColor, strokeWidth: selectedStrokeWidth,
      points: tool === "line" || tool === "arrow" ? [0, 0, 0, 0] : tool === "pencil" ? [0, 0] : undefined,
    };
  }

  function addTextShape(point: Point) {
    const nextShape = buildShape("text", point);
    if (!nextShape) return;
    addShape(nextShape);
    socket?.emit("shape:add", { pageId: activePageId, shape: nextShape });
    setSelectedShapeId(nextShape.id);
    setEditingTextId(nextShape.id);
    setTextValue("");
  }

  function startShape(point: Point) {
    if (activeTool === "text") { addTextShape(point); return; }
    if (activeTool === "area-eraser") {
      setDraftOrigin(point);
      setSelectionBox({ x: point.x, y: point.y, width: 0, height: 0 });
      setIsDrawing(true);
      return;
    }

    const nextShape = buildShape(activeTool, point);
    if (!nextShape) return;

    addShape(nextShape);
    socket?.emit("shape:add", { pageId: activePageId, shape: nextShape });
    setSelectedShapeId(nextShape.id);

    if (nextShape.type !== "text") {
      setDraftShapeId(nextShape.id);
      setDraftOrigin(point);
      setIsDrawing(true);
    }
  }

  function finishDrawing() {
    if (activeTool === "area-eraser" && selectionBox) {
      const removedIds = shapes.filter((shape) => intersectsRectangle(selectionBox, shapeBounds(shape))).map((shape) => shape.id);
      if (removedIds.length > 0) {
        removeShapes(removedIds);
        socket?.emit("shape:delete_multiple", { pageId: activePageId, ids: removedIds });
      }
    }

    if (draftShapeId) {
      const draftShape = shapes.find((shape) => shape.id === draftShapeId);
      if (draftShape && !hasVisibleGeometry(draftShape)) {
        removeShape(draftShapeId, { trackHistory: false });
        socket?.emit("shape:delete", { pageId: activePageId, id: draftShapeId });
        if (activeSelectedShapeId === draftShapeId) setSelectedShapeId(null);
      }
    }

    setIsDrawing(false);
    setDraftShapeId(null);
    setDraftOrigin(null);
    setSelectionBox(null);
  }

  function handlePointerDown(event: KonvaEventObject<MouseEvent | TouchEvent>) {
    const clickedOnEmptyCanvas = event.target === event.target.getStage();
    if (activeTool === "select" || activeTool === "eraser") {
      if (clickedOnEmptyCanvas) setSelectedShapeId(null);
      return;
    }
    const stagePoint = getPointerPosition(event);
    if (!stagePoint) return;
    const slidePoint = toSlidePoint(stagePoint);
    if (!isPointInSlide(slidePoint)) return;
    startShape(slidePoint);
  }

  function handlePointerMove(event: KonvaEventObject<MouseEvent | TouchEvent>) {
    const stagePoint = getPointerPosition(event);
    if (!stagePoint) return;
    
    const slidePoint = toSlidePoint(stagePoint);

    const now = Date.now();
    if (now - lastCursorUpdate.current > 30) {
      socket?.emit("cursor:update", {
        name: currentUser?.name || "Anonymous",
        x: slidePoint.x,
        y: slidePoint.y,
        pageId: activePageId,
      });
      lastCursorUpdate.current = now;
    }

    if (!isDrawing || !draftOrigin) return;

    if (activeTool === "area-eraser" && selectionBox) {
      setSelectionBox({
        x: Math.min(draftOrigin.x, slidePoint.x), y: Math.min(draftOrigin.y, slidePoint.y),
        width: Math.abs(slidePoint.x - draftOrigin.x), height: Math.abs(slidePoint.y - draftOrigin.y),
      });
      return;
    }

    if (!draftShapeId) return;
    const activeShape = shapes.find((shape) => shape.id === draftShapeId);
    if (!activeShape) return;

    let updates: Partial<WhiteboardShape> = {};

    if (activeShape.type === "rectangle" || activeShape.type === "circle") {
      updates = {
        x: Math.min(draftOrigin.x, slidePoint.x), y: Math.min(draftOrigin.y, slidePoint.y),
        width: Math.abs(slidePoint.x - draftOrigin.x), height: Math.abs(slidePoint.y - draftOrigin.y),
      };
    } else if (activeShape.type === "line" || activeShape.type === "arrow") {
      updates = {
        width: Math.abs(slidePoint.x - draftOrigin.x), height: Math.abs(slidePoint.y - draftOrigin.y),
        points: [0, 0, slidePoint.x - draftOrigin.x, slidePoint.y - draftOrigin.y],
      };
    } else if (activeShape.type === "pencil") {
      updates = {
        width: Math.abs(slidePoint.x - draftOrigin.x), height: Math.abs(slidePoint.y - draftOrigin.y),
        points: [...(activeShape.points ?? [0, 0]), slidePoint.x - draftOrigin.x, slidePoint.y - draftOrigin.y],
      };
    }

    updateShape(draftShapeId, updates, { trackHistory: false });
    socket?.emit("shape:update", { pageId: activePageId, id: draftShapeId, updates });
  }

  function handleShapePointerDown(shapeId: string, type: WhiteboardShape["type"]) {
    return (event: KonvaEventObject<MouseEvent | TouchEvent>) => {
      if (activeTool === "eraser") {
        removeShape(shapeId);
        socket?.emit("shape:delete", { pageId: activePageId, id: shapeId });
        if (activeSelectedShapeId === shapeId) setSelectedShapeId(null);
        event.cancelBubble = true;
        return;
      }
      if (activeTool === "select") {
        setSelectedShapeId(shapeId);
        event.cancelBubble = true;
      }
      if (type === "text" && activeTool === "select") return;
    };
  }

  function handleDragEnd(shape: WhiteboardShape) {
    return (event: KonvaEventObject<DragEvent>) => {
      const node = event.target;
      const updates = { x: node.x(), y: node.y() };
      updateShape(shape.id, updates);
      socket?.emit("shape:update", { pageId: activePageId, id: shape.id, updates });
    };
  }

  function handleTransformEnd(shape: WhiteboardShape) {
    return () => {
      const transformer = transformerRef.current;
      if (!transformer) return;
      const nodes = transformer.nodes();
      const node = nodes[0];
      if (!node) return;

      const scaleX = node.scaleX();
      const scaleY = node.scaleY();
      const newWidth = Math.max(24, node.width() * scaleX);
      const newHeight = Math.max(24, node.height() * scaleY);

      node.scaleX(1);
      node.scaleY(1);

      const updates = { x: node.x(), y: node.y(), width: newWidth, height: newHeight };
      updateShape(shape.id, updates);
      socket?.emit("shape:update", { pageId: activePageId, id: shape.id, updates });
    };
  }

  function handleRenamePage(pageId: string, name: string) {
    const finalName = name.trim() || `Page ${pages.findIndex((page) => page.id === pageId) + 1}`;
    renamePage(pageId, finalName);
    socket?.emit("page:rename", { id: pageId, name: finalName });
  }

  function handleDeletePage(pageId: string) {
    resetInteractionState();
    deletePage(pageId);
    socket?.emit("page:delete", pageId);
  }

  function handleEditText(shape: WhiteboardShape) {
    if (activeTool !== "select") return;
    setSelectedShapeId(shape.id);
    setEditingTextId(shape.id);
    setTextValue(shape.text ?? "");
  }

  function handleTextCommit() {
    if (!editingTextId) return;
    const text = textValue.trim() || DEFAULT_TEXT;
    const shape = shapes.find((item) => item.id === editingTextId);
    if (!shape) { setEditingTextId(null); return; }

    const updates = { text, width: Math.max(180, shape.width), height: Math.max(56, shape.height) };
    updateShape(editingTextId, updates);
    socket?.emit("shape:update", { pageId: activePageId, id: editingTextId, updates });
    setEditingTextId(null);
  }

  const cursor = activeTool === "select" ? "default" : activeTool === "eraser" ? "not-allowed" : "crosshair";
  const gridBackground = isGridVisible ? { backgroundImage: "linear-gradient(rgba(148,163,184,0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.12) 1px, transparent 1px)", backgroundSize: "32px 32px" } : undefined;

  const usersOnOtherPages = Object.entries(cursors).filter(([_, c]) => c.pageId && c.pageId !== activePageId);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#f7f4ec]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.95),_rgba(247,244,236,0.68)_42%,_rgba(233,227,214,0.92)_100%)]" />

      <div ref={containerRef} className="relative h-full w-full" style={{ ...gridBackground, cursor }}>
        
        {usersOnOtherPages.length > 0 && (
          <div className="absolute top-20 left-1/2 -translate-x-1/2 z-40 bg-white/90 backdrop-blur px-4 py-2 rounded-full shadow-sm border border-slate-200 text-sm font-medium text-slate-600 transition-all">
            {usersOnOtherPages.map(([_, c]) => c.name).join(", ")} {usersOnOtherPages.length === 1 ? "is" : "are"} on another slide.
          </div>
        )}

        <div className="pointer-events-none absolute inset-0 z-30 overflow-hidden">
          {Object.entries(cursors).map(([id, cursorData]) => {
            if (cursorData.pageId && cursorData.pageId !== activePageId) {
              return null;
            }

            const screenX = slidePosition.x + cursorData.x * zoom;
            const screenY = slidePosition.y + cursorData.y * zoom;

            return (
              <div
                key={id}
                className="absolute top-0 left-0 transition-transform duration-75 ease-linear"
                style={{ transform: `translate(${screenX}px, ${screenY}px)` }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill={cursorData.color} stroke="white" strokeWidth="1.5" xmlns="http://www.w3.org/2000/svg" className="drop-shadow-md">
                  <path d="M5.5 3.21V20.8c0 .45.54.67.85.35l4.86-4.86a.5.5 0 0 1 .35-.15h6.87a.5.5 0 0 0 .35-.85L5.5 3.21z" />
                </svg>
                <div
                  className="absolute left-4 top-4 rounded-md px-2 py-1 text-xs font-semibold text-white shadow-md whitespace-nowrap"
                  style={{ backgroundColor: cursorData.color }}
                >
                  {cursorData.name}
                </div>
              </div>
            );
          })}
        </div>

        <SlideDock
          activePageId={activePageId}
          pages={pages}
          onCreatePage={() => {
            resetInteractionState();
            const newPage = createPage();
            socket?.emit("page:add", newPage);
            
            socket?.emit("cursor:update", {
              name: currentUser?.name || "Anonymous",
              x: 0,
              y: 0,
              pageId: newPage.id,
            });
          }}
          onDeletePage={handleDeletePage}
          onRenamePage={handleRenamePage}
          onSwitchPage={(pageId) => {
            resetInteractionState();
            setActivePage(pageId);
            
            socket?.emit("cursor:update", {
              name: currentUser?.name || "Anonymous",
              x: 0,
              y: 0,
              pageId: pageId,
            });
          }}
        />

        <FloatingToolbar activeTool={activeTool} selectedColor={selectedColor} selectedStrokeWidth={selectedStrokeWidth} colorPalette={colorPalette} strokeWidthOptions={strokeWidthOptions} canUndo={pastCount > 0} canRedo={futureCount > 0} currentZoom={zoom} onRedo={() => { resetInteractionState(); redo(); }} onPreviousSlide={() => { const next = pages[(currentPageIndex - 1 + pages.length) % pages.length]; setActivePage(next.id); resetInteractionState(); }} onNextSlide={() => { const next = pages[(currentPageIndex + 1) % pages.length]; setActivePage(next.id); resetInteractionState(); }} onZoomIn={() => setZoom((current) => clamp(current + ZOOM_STEP, MIN_ZOOM, MAX_ZOOM))} onZoomOut={() => setZoom((current) => clamp(current - ZOOM_STEP, MIN_ZOOM, MAX_ZOOM))} onSelectColor={setSelectedColor} onSelectStrokeWidth={setSelectedStrokeWidth} onToggleGrid={toggleGrid} onToolChange={(tool) => { setActiveTool(tool); if (tool !== "select") { setSelectedShapeId(null); } }} onUndo={() => { resetInteractionState(); undo(); }} />

        <div className="pointer-events-none absolute right-5 top-5 z-20 rounded-full border border-slate-200/80 bg-white/88 px-4 py-2 text-sm font-medium text-slate-600 shadow-sm backdrop-blur">
          {currentPage?.name ?? "Page"} | {shapes.length} element{shapes.length === 1 ? "" : "s"}
        </div>

        {stageSize.width > 0 && stageSize.height > 0 ? (
          <Stage ref={stageRef} width={stageSize.width} height={stageSize.height} onMouseDown={handlePointerDown} onMouseMove={handlePointerMove} onMouseUp={finishDrawing} onMouseLeave={finishDrawing} onTouchStart={handlePointerDown} onTouchMove={handlePointerMove} onTouchEnd={finishDrawing}>
            <Layer>
              <Group x={slidePosition.x} y={slidePosition.y} scaleX={zoom} scaleY={zoom}>
                {showMargins && (
                  <>
                    {collegeMarginMode ? (
                      <Line points={[80, 0, 80, SLIDE_HEIGHT]} stroke={getMarginGuideColor(appTheme, collegeMarginMode)} strokeWidth={2} listening={false} dash={[0]} />
                    ) : (
                      <>
                        <Line points={[60, 60, SLIDE_WIDTH - 60, 60]} stroke={getMarginGuideColor(appTheme, collegeMarginMode)} strokeWidth={1} listening={false} dash={[4, 4]} />
                        <Line points={[60, SLIDE_HEIGHT - 60, SLIDE_WIDTH - 60, SLIDE_HEIGHT - 60]} stroke={getMarginGuideColor(appTheme, collegeMarginMode)} strokeWidth={1} listening={false} dash={[4, 4]} />
                        <Line points={[60, 60, 60, SLIDE_HEIGHT - 60]} stroke={getMarginGuideColor(appTheme, collegeMarginMode)} strokeWidth={1} listening={false} dash={[4, 4]} />
                        <Line points={[SLIDE_WIDTH - 60, 60, SLIDE_WIDTH - 60, SLIDE_HEIGHT - 60]} stroke={getMarginGuideColor(appTheme, collegeMarginMode)} strokeWidth={1} listening={false} dash={[4, 4]} />
                      </>
                    )}
                  </>
                )}

                {shapes.map((shape) => {
                  const isSelected = activeSelectedShapeId === shape.id;
                  const sharedProps = { stroke: shape.stroke, strokeWidth: shape.strokeWidth, draggable: activeTool === "select", onDragEnd: handleDragEnd(shape), onMouseDown: handleShapePointerDown(shape.id, shape.type), onTap: handleShapePointerDown(shape.id, shape.type) };

                  if (shape.type === "rectangle") return <Rect key={shape.id} {...sharedProps} x={shape.x} y={shape.y} width={shape.width} height={shape.height} cornerRadius={16} shadowBlur={isSelected ? 12 : 0} shadowColor="#1e293b" dash={isSelected ? [12, 8] : undefined} ref={(node) => { shapeRefs.current[shape.id] = node; }} />;
                  if (shape.type === "circle") return <Ellipse key={shape.id} {...sharedProps} x={shape.x + shape.width / 2} y={shape.y + shape.height / 2} radiusX={Math.max(shape.width / 2, 1)} radiusY={Math.max(shape.height / 2, 1)} shadowBlur={isSelected ? 12 : 0} shadowColor="#1e293b" dash={isSelected ? [12, 8] : undefined} ref={(node) => { shapeRefs.current[shape.id] = node; }} />;
                  if (shape.type === "arrow") return <Arrow key={shape.id} {...sharedProps} x={shape.x} y={shape.y} points={shape.points ?? []} lineCap="round" lineJoin="round" pointerLength={12} pointerWidth={10} hitStrokeWidth={Math.max(shape.strokeWidth + 10, 12)} dash={isSelected ? [12, 8] : undefined} ref={(node) => { shapeRefs.current[shape.id] = node; }} />;
                  if (shape.type === "line" || shape.type === "pencil") return <Line key={shape.id} {...sharedProps} x={shape.x} y={shape.y} points={shape.points ?? []} lineCap="round" lineJoin="round" hitStrokeWidth={Math.max(shape.strokeWidth + 10, 12)} tension={shape.type === "pencil" ? 0.25 : 0} dash={isSelected && shape.type === "line" ? [12, 8] : undefined} ref={(node) => { shapeRefs.current[shape.id] = node; }} />;

                  return <Text key={shape.id} {...sharedProps} x={shape.x} y={shape.y} text={shape.text ?? DEFAULT_TEXT} width={Math.max(shape.width, 180)} height={Math.max(shape.height, 56)} fontSize={18 + shape.strokeWidth} fill={shape.stroke} shadowBlur={isSelected ? 8 : 0} shadowColor="#1e293b" onDblClick={() => handleEditText(shape)} onDblTap={() => handleEditText(shape)} ref={(node) => { shapeRefs.current[shape.id] = node; }} />;
                })}

                {selectionBox && activeTool === "area-eraser" ? <Rect x={selectionBox.x} y={selectionBox.y} width={selectionBox.width} height={selectionBox.height} fill="rgba(37,99,235,0.12)" stroke="#2563eb" dash={[8, 8]} listening={false} /> : null}

                {activeSelectedShapeId && activeTool === "select" ? <Transformer ref={transformerRef} boundBoxFunc={(oldBox, newBox) => { if (newBox.width < 24 || newBox.height < 24) return oldBox; return newBox; }} onTransformEnd={() => { const shape = shapes.find((item) => item.id === activeSelectedShapeId); if (shape) handleTransformEnd(shape)(); }} /> : null}
              </Group>
            </Layer>
          </Stage>
        ) : null}

        {editingTextId ? <textarea autoFocus value={textValue} onChange={(event) => setTextValue(event.target.value)} onBlur={handleTextCommit} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); handleTextCommit(); } }} style={textInputStyle} /> : null}
      </div>
    </div>
  );
}