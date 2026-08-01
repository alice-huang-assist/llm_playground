"use client";

import styles from "./SystemPrompt.module.css";

export default function SystemPrompt({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className={styles.wrapper}>
      <label className={styles.label} htmlFor="system-prompt">
        System prompt
      </label>
      <textarea
        id="system-prompt"
        className={styles.textarea}
        rows={3}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Instructions the model receives before the conversation"
      />
    </div>
  );
}
