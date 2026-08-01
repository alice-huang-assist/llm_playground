/**
 * Sampling parameters, their ranges, and the rule that keeps a request honest:
 * a parameter left at its default is omitted so the provider applies its own.
 *
 * The documented defaults are Ollama's, since it is the primary local runtime.
 * Another OpenAI-compatible server may default differently; leaving a control
 * untouched still means "whatever that server does", because nothing is sent.
 */

export type ParameterKey =
  | "temperature"
  | "top_p"
  | "max_tokens"
  | "seed"
  | "top_k"
  | "min_p"
  | "repeat_penalty";

export interface ParameterSpec {
  key: ParameterKey;
  label: string;
  /** null means the parameter is unset by default, so nothing is sent. */
  default: number | null;
  min?: number;
  max?: number;
  step: number;
  integer: boolean;
  /** Whether the control gets a slider; unbounded integers get a field only. */
  slider: boolean;
  help: string;
}

export const PARAMETERS: ParameterSpec[] = [
  {
    key: "temperature",
    label: "temperature",
    default: 0.8,
    min: 0,
    max: 2,
    step: 0.05,
    integer: false,
    slider: true,
    help: "Randomness of the sampling. 0 is greedy and repeatable.",
  },
  {
    key: "top_p",
    label: "top_p",
    default: 0.9,
    min: 0,
    max: 1,
    step: 0.01,
    integer: false,
    slider: true,
    help: "Nucleus sampling: consider tokens up to this cumulative probability.",
  },
  {
    key: "max_tokens",
    label: "max_tokens",
    default: null,
    min: 1,
    step: 1,
    integer: true,
    slider: false,
    help: "Cap on the reply length. Empty lets the server decide.",
  },
  {
    key: "seed",
    label: "seed",
    default: null,
    step: 1,
    integer: true,
    slider: false,
    help: "Fix for a repeatable reply. Empty means random.",
  },
  {
    key: "top_k",
    label: "top_k",
    default: 40,
    min: 0,
    step: 1,
    integer: true,
    slider: false,
    help: "Consider only this many of the most likely tokens.",
  },
  {
    key: "min_p",
    label: "min_p",
    default: 0,
    min: 0,
    max: 1,
    step: 0.01,
    integer: false,
    slider: true,
    help: "Drop tokens below this fraction of the most likely token.",
  },
  {
    key: "repeat_penalty",
    label: "repeat_penalty",
    default: 1.1,
    min: 0.5,
    max: 2,
    step: 0.05,
    integer: false,
    slider: true,
    help: "Above 1 discourages repeating what has already been said.",
  },
];

/** A parameter's current value; null means unset, so it is never sent. */
export type ParameterValues = Record<ParameterKey, number | null>;

export const DEFAULT_PARAMETERS: ParameterValues = Object.fromEntries(
  PARAMETERS.map((spec) => [spec.key, spec.default]),
) as ParameterValues;

const SPEC_BY_KEY = new Map(PARAMETERS.map((spec) => [spec.key, spec]));

export function parameterSpec(key: ParameterKey): ParameterSpec {
  const spec = SPEC_BY_KEY.get(key);
  if (!spec) throw new Error(`Unknown parameter "${key}"`);
  return spec;
}

/**
 * Bring a value inside its spec's range instead of forwarding nonsense to the
 * provider. Anything that is not a finite number becomes unset.
 */
export function clampParameter(
  key: ParameterKey,
  value: unknown,
): number | null {
  if (value === null || value === undefined || value === "") return null;

  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return null;

  const spec = parameterSpec(key);
  let clamped = numeric;
  if (spec.min !== undefined) clamped = Math.max(spec.min, clamped);
  if (spec.max !== undefined) clamped = Math.min(spec.max, clamped);
  if (spec.integer) clamped = Math.round(clamped);

  return clamped;
}

export type ParameterPayload = Partial<Record<ParameterKey, number>>;

/**
 * Build what actually goes on the wire: clamped, with every parameter still at
 * its default left out entirely.
 */
export function buildParameterPayload(
  values: Partial<Record<ParameterKey, unknown>> | null | undefined,
): ParameterPayload {
  const payload: ParameterPayload = {};
  if (!values) return payload;

  for (const spec of PARAMETERS) {
    const clamped = clampParameter(spec.key, values[spec.key]);
    if (clamped === null || clamped === spec.default) continue;
    payload[spec.key] = clamped;
  }

  return payload;
}
