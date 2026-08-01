"use client";

import {
  DEFAULT_PARAMETERS,
  PARAMETERS,
  clampParameter,
  type ParameterKey,
  type ParameterValues,
} from "@/lib/params";

import styles from "./ParameterSidebar.module.css";

function formatDefault(value: number | null) {
  return value === null ? "unset" : String(value);
}

export default function ParameterSidebar({
  values,
  onChange,
}: {
  values: ParameterValues;
  onChange: (values: ParameterValues) => void;
}) {
  const set = (key: ParameterKey, raw: string) => {
    onChange({ ...values, [key]: raw === "" ? null : clampParameter(key, raw) });
  };

  return (
    <aside className={styles.sidebar}>
      <div className={styles.header}>
        <h2 className={styles.title}>Parameters</h2>
        <button
          type="button"
          className={styles.reset}
          onClick={() => onChange({ ...DEFAULT_PARAMETERS })}
        >
          Reset
        </button>
      </div>

      <p className={styles.note}>
        Anything left at its default is not sent, so the server applies its own.
        Defaults shown are Ollama&apos;s.
      </p>

      {PARAMETERS.map((spec) => {
        const value = values[spec.key];
        const atDefault = value === spec.default;

        return (
          <div key={spec.key} className={styles.control}>
            <div className={styles.row}>
              <label className={styles.label} htmlFor={`param-${spec.key}`}>
                {spec.label}
              </label>
              <span
                className={atDefault ? styles.valueMuted : styles.value}
                aria-live="off"
              >
                {value === null ? "unset" : value}
              </span>
            </div>

            <div className={styles.inputs}>
              {spec.slider && (
                <input
                  type="range"
                  className={styles.slider}
                  min={spec.min}
                  max={spec.max}
                  step={spec.step}
                  value={value ?? spec.min ?? 0}
                  onChange={(event) => set(spec.key, event.target.value)}
                  aria-label={`${spec.label} slider`}
                />
              )}
              <input
                id={`param-${spec.key}`}
                type="number"
                className={styles.number}
                min={spec.min}
                max={spec.max}
                step={spec.step}
                value={value ?? ""}
                placeholder={formatDefault(spec.default)}
                onChange={(event) => set(spec.key, event.target.value)}
              />
            </div>

            <p className={styles.help}>
              {spec.help} Default: {formatDefault(spec.default)}.
            </p>
          </div>
        );
      })}
    </aside>
  );
}
