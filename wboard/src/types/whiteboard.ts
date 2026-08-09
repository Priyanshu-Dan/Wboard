export type ShapeType =
  | "rectangle"
  | "circle"
  | "arrow"
  | "line"
  | "pencil"
  | "text";

export type Tool =
  | "select"
  | "rectangle"
  | "circle"
  | "arrow"
  | "line"
  | "pencil"
  | "text"
  | "eraser"
  | "area-eraser"
  |  "hand";

export type StrokeWidth = number;

export type PageType = "whiteboard" | "slide";

export type AppTheme = "classic" | "midnight" | "sunny";

export type WhiteboardPageContent = {
  shapes: WhiteboardShape[];
};

export type SlidePageContent = {
  placeholder: string;
};

export type Page = {
  id: string;
  name: string;
  pageType: PageType;
  content: WhiteboardPageContent | SlidePageContent;
};

export type WhiteboardShape = {
  id: string;
  type: ShapeType;
  x: number;
  y: number;
  width: number;
  height: number;
  stroke: string;
  strokeWidth: number;
  points?: number[];
  text?: string;
};

export type Participant = {
  uuid: string;
  socketId: string;
  name: string;
  isHost: boolean;
  isMuted: boolean;
  handRaised: boolean;
};