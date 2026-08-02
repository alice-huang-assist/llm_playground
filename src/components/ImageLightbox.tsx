"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";

export interface ImageLightboxMeta {
  prompt: string;
  seed: number | null;
  sampler: string;
  steps: number;
}

export interface ImageLightboxItem {
  id: string;
  src: string;
  alt?: string;
  meta?: ImageLightboxMeta;
}

interface ImageLightboxProps {
  images: ImageLightboxItem[];
  index: number;
  onClose: () => void;
  onIndexChange: (index: number) => void;
}

const FOCUSABLE =
  'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export default function ImageLightbox({
  images,
  index,
  onClose,
  onIndexChange,
}: ImageLightboxProps) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const safeIndex =
    images.length === 0 ? 0 : Math.min(Math.max(index, 0), images.length - 1);
  const current = images[safeIndex];
  const isGallery = images.length > 1;

  const goPrev = useCallback(() => {
    if (images.length <= 1) return;
    onIndexChange((safeIndex - 1 + images.length) % images.length);
  }, [images.length, onIndexChange, safeIndex]);

  const goNext = useCallback(() => {
    if (images.length <= 1) return;
    onIndexChange((safeIndex + 1) % images.length);
  }, [images.length, onIndexChange, safeIndex]);

  // Whatever opened the lightbox gets focus back when it closes, so keyboard
  // users return to the thumbnail they came from rather than the document body.
  //
  // This must be declared BEFORE the effect that focuses Close: effects run in
  // declaration order, so capturing second would record the Close button — which
  // is gone by unmount, leaving focus on <body>.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    return () => {
      if (opener && document.contains(opener)) opener.focus();
    };
  }, []);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      // Trap: Tab cycles within the dialog instead of escaping to the page
      // behind the scrim.
      if (event.key === "Tab") {
        const root = dialogRef.current;
        if (!root) return;
        const nodes = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
          (node) => node.offsetParent !== null,
        );
        if (nodes.length === 0) return;
        const first = nodes[0]!;
        const last = nodes[nodes.length - 1]!;
        const active = document.activeElement;

        if (event.shiftKey && (active === first || !root.contains(active))) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && active === last) {
          event.preventDefault();
          first.focus();
        }
        return;
      }

      if (!isGallery) return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goPrev();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        goNext();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [goNext, goPrev, isGallery, onClose]);

  function onBackdropClick(event: ReactMouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) onClose();
  }

  function onDialogKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
    }
  }

  if (!current) return null;

  const meta = current.meta;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgb(28_25_23_/_0.82)] p-6"
      role="presentation"
      onClick={onBackdropClick}
    >
      <div
        ref={dialogRef}
        className="flex max-h-full w-full max-w-5xl flex-col gap-3 rounded-lg border border-border bg-surface p-4 shadow-lg"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={onDialogKeyDown}
      >
        <div className="flex items-center justify-between gap-3">
          <span id={titleId} className="font-mono text-meta text-ink-muted">
            {isGallery ? `${safeIndex + 1} / ${images.length}` : "Full view"}
          </span>
          <button
            ref={closeRef}
            type="button"
            className="rounded-sm border border-border px-3 py-1 text-label text-ink-muted transition-colors hover:border-border-strong hover:text-ink"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <div className="flex min-h-0 flex-1 items-center gap-3">
          {isGallery && (
            <button
              type="button"
              className="shrink-0 rounded-sm border border-border px-2.5 py-2 text-ink-muted transition-colors hover:border-border-strong hover:text-ink"
              onClick={goPrev}
              aria-label="Previous image"
            >
              ‹
            </button>
          )}
          <div className="flex min-h-0 flex-1 items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="max-h-[65vh] max-w-full rounded-md object-contain"
              src={current.src}
              alt={current.alt ?? "Generated image"}
            />
          </div>
          {isGallery && (
            <button
              type="button"
              className="shrink-0 rounded-sm border border-border px-2.5 py-2 text-ink-muted transition-colors hover:border-border-strong hover:text-ink"
              onClick={goNext}
              aria-label="Next image"
            >
              ›
            </button>
          )}
        </div>

        {meta && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 border-t border-border pt-3 font-mono text-meta">
            <dt className="text-ink-subtle">prompt</dt>
            <dd className="min-w-0 truncate text-ink">{meta.prompt || "—"}</dd>
            <dt className="text-ink-subtle">seed</dt>
            <dd className="text-ink">
              {meta.seed === null ? "random" : meta.seed}
            </dd>
            <dt className="text-ink-subtle">sampler</dt>
            <dd className="text-ink">{meta.sampler || "—"}</dd>
            <dt className="text-ink-subtle">steps</dt>
            <dd className="text-ink">{meta.steps}</dd>
          </dl>
        )}

        {isGallery && (
          <div
            className="flex flex-wrap gap-2 border-t border-border pt-3"
            role="tablist"
            aria-label="Images"
          >
            {images.map((image, imageIndex) => (
              <button
                key={image.id}
                type="button"
                role="tab"
                aria-selected={imageIndex === safeIndex}
                className={`overflow-hidden rounded-sm border transition-colors ${
                  imageIndex === safeIndex
                    ? "border-accent"
                    : "border-border hover:border-border-strong"
                }`}
                onClick={() => onIndexChange(imageIndex)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="size-14 object-cover" src={image.src} alt="" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
