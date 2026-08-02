"use client";

import {
  DEFAULT_PARAMETERS,
  PARAMETERS,
  clampParameter,
  type ParameterKey,
  type ParameterValues,
} from "@/lib/params";

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
    <div className="flex flex-col gap-5 px-5 py-6">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-meta tracking-wide text-ink-subtle uppercase">
          Parameters
        </h2>
        <button
          type="button"
          className="rounded-sm border border-border px-2 py-0.5 text-meta text-ink-muted transition-colors hover:border-border-strong hover:text-ink"
          onClick={() => onChange({ ...DEFAULT_PARAMETERS })}
        >
          Reset
        </button>
      </div>

      <p className="text-meta text-ink-subtle">
        Anything left at its default is not sent, so the server applies its own.
        Defaults shown are Ollama&apos;s.
      </p>

      {PARAMETERS.map((spec) => {
        const value = values[spec.key];
        const atDefault = value === spec.default;

        return (
          <div key={spec.key} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <label
                className="font-mono text-label text-ink"
                htmlFor={`param-${spec.key}`}
              >
                {spec.label}
              </label>
              <span
                className={`font-mono text-meta ${
                  atDefault ? "text-ink-subtle" : "text-accent-text"
                }`}
                aria-live="off"
              >
                {value === null ? "unset" : value}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {spec.slider && (
                <input
                  type="range"
                  className="min-w-0 flex-1 accent-accent"
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
                className="w-20 shrink-0 rounded-sm border border-border bg-canvas px-2 py-1 font-mono text-meta text-ink transition-colors placeholder:text-ink-subtle focus:border-accent"
                min={spec.min}
                max={spec.max}
                step={spec.step}
                value={value ?? ""}
                placeholder={formatDefault(spec.default)}
                onChange={(event) => set(spec.key, event.target.value)}
              />
            </div>

            <p className="text-meta text-ink-subtle">
              {spec.help} Default: {formatDefault(spec.default)}.
            </p>
          </div>
        );
      })}
    </div>
  );
}
