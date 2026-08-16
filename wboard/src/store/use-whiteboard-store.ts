"use client";

import { create } from "zustand";
import { v4 as uuidv4 } from "uuid";

import type {
  AppTheme,
  Page,
  PageType,
  Tool,
  WhiteboardShape,
  Participant,
} from "@/types/whiteboard";

type User = {
  id: string;
  name: string;
};

type WhiteboardSnapshot = {
  pages: Page[];
  activePageId: string;
};

// --- PHASE 5.5: Added pageId so incoming socket shapes know where to go ---
type WhiteboardWriteOptions = {
  trackHistory?: boolean;
  pageId?: string; 
};

type WhiteboardState = WhiteboardSnapshot & {
  activeTool: Tool;
  selectedColor: string;
  selectedStrokeWidth: number;
  colorPalette: string[];
  appTheme: AppTheme;
  themeOptions: AppTheme[];
  isGridVisible: boolean;
  showMargins: boolean;
  collegeMarginMode: boolean;
  strokeWidthOptions: number[];
  past: WhiteboardSnapshot[];
  future: WhiteboardSnapshot[];
  
  roomId: string | null;
  currentUser: User | null;

  // --- NEW: WebRTC Participant Roster State ---
  participants: Participant[];
  setParticipants: (participants: Participant[]) => void;
  // --------------------------------------------

  setRoomId: (id: string | null) => void;
  setCurrentUser: (name: string, id: string) => void;
  
  setActiveTool: (tool: Tool) => void;
  setSelectedColor: (color: string) => void;
  setSelectedStrokeWidth: (width: number) => void;
  setAppTheme: (theme: AppTheme) => void;
  toggleGrid: () => void;
  toggleMargins: () => void;
  toggleCollegeMarginMode: () => void;
  
  createPage: (pageType?: PageType) => Page;
  addPage: (page: Page) => void;
  deletePage: (pageId: string) => void;
  renamePage: (pageId: string, name: string) => void;
  setActivePage: (pageId: string) => void;
  
  // --- CATCH UP PROTOCOL ---
  setPages: (pages: Page[]) => void;
  
  addShape: (shape: WhiteboardShape, options?: WhiteboardWriteOptions) => void;
  updateShape: (
    id: string,
    updates: Partial<WhiteboardShape>,
    options?: WhiteboardWriteOptions,
  ) => void;
  removeShape: (id: string, options?: WhiteboardWriteOptions) => void;
  removeShapes: (ids: string[], options?: WhiteboardWriteOptions) => void;
  undo: () => void;
  redo: () => void;
};

const DEFAULT_COLORS = [
  "#0f172a", "#2563eb", "#dc2626", "#16a34a", "#ea580c", "#7c3aed",
];

const DEFAULT_STROKE_WIDTHS = [1, 2, 4, 6];
const DEFAULT_THEME_OPTIONS: AppTheme[] = ["classic", "midnight", "sunny"];

function createPageRecord(name: string, pageType: PageType = "whiteboard"): Page {
  return {
    id: uuidv4(),
    name,
    pageType,
    content: pageType === "whiteboard"
        ? { shapes: [] }
        : { placeholder: "Slide content will appear here" },
  };
}

function cloneShape(shape: WhiteboardShape): WhiteboardShape {
  return {
    ...shape,
    points: shape.points ? [...shape.points] : undefined,
  };
}

function clonePages(pages: Page[]): Page[] {
  return pages.map((page) => ({
    ...page,
    content: page.pageType === "whiteboard" && "shapes" in page.content
        ? { shapes: page.content.shapes.map(cloneShape) }
        : { placeholder: (page.content as { placeholder: string }).placeholder },
  }));
}

function cloneSnapshot(snapshot: WhiteboardSnapshot): WhiteboardSnapshot {
  return {
    pages: clonePages(snapshot.pages),
    activePageId: snapshot.activePageId,
  };
}

function updateSnapshot(
  state: WhiteboardState,
  updater: (snapshot: WhiteboardSnapshot) => void,
  trackHistory = true,
) {
  const current = cloneSnapshot(state);
  const next = cloneSnapshot(state);

  updater(next);

  if (JSON.stringify(current) === JSON.stringify(next)) {
    return state;
  }

  return {
    ...state,
    pages: next.pages,
    activePageId: next.activePageId,
    past: trackHistory ? [...state.past, current] : state.past,
    future: trackHistory ? [] : state.future,
  };
}

const initialPage = createPageRecord("Page 1");

export const useWhiteboardStore = create<WhiteboardState>((set) => ({
  roomId: null,
  currentUser: null,
  
  // --- NEW: Initializing Participant Roster ---
  participants: [],
  setParticipants: (participants) => set({ participants }),
  // --------------------------------------------

  pages: [initialPage],
  activePageId: initialPage.id,
  activeTool: "select",
  selectedColor: DEFAULT_COLORS[0],
  selectedStrokeWidth: 2,
  colorPalette: DEFAULT_COLORS,
  strokeWidthOptions: DEFAULT_STROKE_WIDTHS,
  appTheme: "classic",
  themeOptions: DEFAULT_THEME_OPTIONS,
  isGridVisible: true,
  showMargins: true,
  collegeMarginMode: false,
  past: [],
  future: [],
  
  setRoomId: (id) => set({ roomId: id }),
  setCurrentUser: (name, id) => set({ currentUser: { id, name } }),
  
  setActiveTool: (tool) => set({ activeTool: tool }),
  setSelectedColor: (color) => set({ selectedColor: color }),
  setSelectedStrokeWidth: (width) => set({ selectedStrokeWidth: width }),
  setAppTheme: (theme) => set({ appTheme: theme }),
  toggleGrid: () => set((state) => ({ isGridVisible: !state.isGridVisible })),
  toggleMargins: () => set((state) => ({ showMargins: !state.showMargins })),
  toggleCollegeMarginMode: () => set((state) => ({ collegeMarginMode: !state.collegeMarginMode })),
  
  createPage: (pageType = "whiteboard") => {
    let newPage: Page | null = null;
    set((state) =>
      updateSnapshot(state, (snapshot) => {
        newPage = createPageRecord(`Page ${snapshot.pages.length + 1}`, pageType);
        snapshot.pages.push(newPage);
        snapshot.activePageId = newPage.id;
      }),
    );
    return newPage!;
  },
  
  addPage: (page) =>
    set((state) =>
      updateSnapshot(state, (snapshot) => {
        if (!snapshot.pages.some((p) => p.id === page.id)) {
          snapshot.pages.push(page);
        }
      }, false),
    ),

  deletePage: (pageId) =>
    set((state) =>
      updateSnapshot(state, (snapshot) => {
        const pageIndex = snapshot.pages.findIndex((page) => page.id === pageId);
        if (pageIndex === -1) return;

        if (snapshot.pages.length === 1) {
          const replacement = createPageRecord("Page 1");
          snapshot.pages = [replacement];
          snapshot.activePageId = replacement.id;
          return;
        }

        snapshot.pages.splice(pageIndex, 1);

        if (snapshot.activePageId === pageId) {
          const fallbackPage = snapshot.pages[Math.max(pageIndex - 1, 0)];
          snapshot.activePageId = fallbackPage.id;
        }
      }),
    ),

  renamePage: (pageId, name) =>
    set((state) =>
      updateSnapshot(state, (snapshot) => {
        const normalizedName = name.trim();
        if (!normalizedName) return;

        snapshot.pages = snapshot.pages.map((page) =>
          page.id === pageId ? { ...page, name: normalizedName } : page,
        );
      }),
    ),

  setActivePage: (pageId) =>
    set((state) => {
      if (!state.pages.some((page) => page.id === pageId)) return state;
      return { activePageId: pageId };
    }),

  // --- NEW: For Late-Joiners to sync instantly ---
  setPages: (incomingPages) =>
    set((state) => ({
      ...state,
      pages: incomingPages,
      activePageId: incomingPages.some((p) => p.id === state.activePageId) 
        ? state.activePageId 
        : incomingPages[0]?.id
    })),

addShape: (shape, options) =>
    set((state) =>
      updateSnapshot(state, (snapshot) => {
          const targetPageId = options?.pageId || snapshot.activePageId;
          snapshot.pages = snapshot.pages.map((page) =>
            page.id === targetPageId && page.pageType === "whiteboard" && "shapes" in page.content
              ? {
                  ...page,
                  content: { shapes: [...page.content.shapes, cloneShape(shape)] },
                }
              : page,
          );
        },
        options?.trackHistory,
      ),
    ),

  updateShape: (id, updates, options) =>
    set((state) =>
      updateSnapshot(state, (snapshot) => {
          const targetPageId = options?.pageId || snapshot.activePageId;
          snapshot.pages = snapshot.pages.map((page) =>
            page.id === targetPageId && page.pageType === "whiteboard" && "shapes" in page.content
              ? {
                  ...page,
                  content: {
                    shapes: page.content.shapes.map((shape) =>
                      shape.id === id
                        ? {
                            ...shape,
                            ...updates,
                            points: updates.points ? [...updates.points] : shape.points,
                          }
                        : shape,
                    ),
                  },
                }
              : page,
          );
        },
        options?.trackHistory,
      ),
    ),

  removeShape: (id, options) =>
    set((state) =>
      updateSnapshot(state, (snapshot) => {
          const targetPageId = options?.pageId || snapshot.activePageId;
          snapshot.pages = snapshot.pages.map((page) =>
            page.id === targetPageId && page.pageType === "whiteboard" && "shapes" in page.content
              ? {
                  ...page,
                  content: {
                    shapes: page.content.shapes.filter((shape) => shape.id !== id),
                  },
                }
              : page,
          );
        },
        options?.trackHistory,
      ),
    ),

  removeShapes: (ids, options) =>
    set((state) =>
      updateSnapshot(state, (snapshot) => {
          const targetPageId = options?.pageId || snapshot.activePageId;
          snapshot.pages = snapshot.pages.map((page) =>
            page.id === targetPageId && page.pageType === "whiteboard" && "shapes" in page.content
              ? {
                  ...page,
                  content: {
                    shapes: page.content.shapes.filter((shape) => !ids.includes(shape.id)),
                  },
                }
              : page,
          );
        },
        options?.trackHistory,
      ),
    ),

  undo: () =>
    set((state) => {
      const previous = state.past[state.past.length - 1];
      if (!previous) return state;

      const current = cloneSnapshot(state);

      return {
        pages: clonePages(previous.pages),
        activePageId: previous.activePageId,
        past: state.past.slice(0, -1),
        future: [current, ...state.future],
      };
    }),

  redo: () =>
    set((state) => {
      const next = state.future[0];
      if (!next) return state;

      const current = cloneSnapshot(state);

      return {
        pages: clonePages(next.pages),
        activePageId: next.activePageId,
        past: [...state.past, current],
        future: state.future.slice(1),
      };
    }),
}));

