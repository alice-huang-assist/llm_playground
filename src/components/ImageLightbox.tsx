"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";

import styles from "./ImageLightbox.module.css";

export interface ImageLightboxItem {
  id: string;
  src: string;
  alt?: string;
}

interface ImageLightboxProps {
  images: ImageLightboxItem[];
  index: number;
  onClose: () => void;
  onIndexChange: (index: number) => void;
}

export default function ImageLightbox({
  images,
  index,
  onClose,
  onIndexChange,
}: ImageLightboxProps) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const safeIndex =
    images.length === 0
      ? 0
      : Math.min(Math.max(index, 0), images.length - 1);
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

  return (
    <div
      className={styles.backdrop}
      role="presentation"
      onClick={onBackdropClick}
    >
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={onDialogKeyDown}
      >
        <div className={styles.toolbar}>
          <span id={titleId} className={styles.counter}>
            {isGallery
              ? `${safeIndex + 1} / ${images.length}`
              : "Full view"}
          </span>
          <button
            ref={closeRef}
            type="button"
            className={styles.close}
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <div className={styles.stage}>
          {isGallery && (
            <button
              type="button"
              className={styles.nav}
              onClick={goPrev}
              aria-label="Previous image"
            >
              ‹
            </button>
          )}
          <div className={styles.imageWrap}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className={styles.image}
              src={current.src}
              alt={current.alt ?? "Generated image"}
            />
          </div>
          {isGallery && (
            <button
              type="button"
              className={styles.nav}
              onClick={goNext}
              aria-label="Next image"
            >
              ›
            </button>
          )}
        </div>

        {isGallery && (
          <div className={styles.thumbs} role="tablist" aria-label="Images">
            {images.map((image, imageIndex) => (
              <button
                key={image.id}
                type="button"
                role="tab"
                aria-selected={imageIndex === safeIndex}
                className={
                  imageIndex === safeIndex ? styles.thumbActive : styles.thumb
                }
                onClick={() => onIndexChange(imageIndex)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className={styles.thumbImage}
                  src={image.src}
                  alt=""
                />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
