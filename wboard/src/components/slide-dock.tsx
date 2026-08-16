"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import type { Page } from "@/types/whiteboard";

type SlideDockProps = {
  activePageId: string;
  pages: Page[];
  onCreatePage: () => void;
  onDeletePage: (pageId: string) => void;
  onRenamePage: (pageId: string, name: string) => void;
  onSwitchPage: (pageId: string) => void;
};

function ActivePageTitleInput({
  page,
  onRenamePage,
}: {
  page: Page;
  onRenamePage: (pageId: string, name: string) => void;
}) {
  const [title, setTitle] = useState(page.name);

  return (
    <input
      className="w-full bg-transparent text-sm font-semibold text-white outline-none placeholder:text-slate-300"
      value={title}
      onChange={(event) => setTitle(event.target.value)}
      onBlur={() => onRenamePage(page.id, title)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.currentTarget.blur();
        }
      }}
      placeholder={page.name}
    />
  );
}

export function SlideDock({
  activePageId,
  pages,
  onCreatePage,
  onDeletePage,
  onRenamePage,
  onSwitchPage,
}: SlideDockProps) {
  const activePage = pages.find((page) => page.id === activePageId);

  return (
    <div className="absolute inset-x-0 top-4 z-20 flex justify-center px-4 pointer-events-none">
      <div className="pointer-events-auto flex max-w-[min(100%,960px)] items-center gap-2 overflow-x-auto rounded-full border border-slate-200/80 bg-white/92 px-3 py-2 shadow-[0_16px_40px_rgba(15,23,42,0.10)] backdrop-blur">
        {pages.map((page, index) => {
          const isActive = page.id === activePageId;

          return (
            <div
              key={page.id}
              className={[
                "flex items-center rounded-full px-4 py-2 text-sm font-medium transition",
                isActive
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900",
              ].join(" ")}
            >
              {isActive ? (
                <ActivePageTitleInput page={page} onRenamePage={onRenamePage} />
              ) : (
                <button
                  type="button"
                  onClick={() => onSwitchPage(page.id)}
                  className="text-left"
                  title={page.name}
                >
                  {index + 1}. {page.name}
                </button>
              )}
            </div>
          );
        })}

        <div className="mx-1 h-6 w-px bg-slate-200" />

        <button
          type="button"
          onClick={onCreatePage}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
          aria-label="Create page"
          title="Create page"
        >
          <Plus className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={() => activePage && onDeletePage(activePage.id)}
          disabled={!activePage}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:border-rose-300 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Delete page"
          title="Delete page"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
