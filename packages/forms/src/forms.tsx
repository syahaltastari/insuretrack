"use client";

import type { ReactNode } from "react";
import { FormProvider, useFormContext, type UseFormReturn } from "react-hook-form";

/**
 * Re-export FormProvider so consumers can wire `methods` once at the form root
 * and all <FormField> descendants can read from context.
 */
export function Form<T extends Record<string, unknown>>({
  methods,
  onSubmit,
  children,
  className,
  style,
  id,
}: {
  methods: UseFormReturn<T>;
  onSubmit: (values: T) => void | Promise<void>;
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
  /**
   * When the submit button lives OUTSIDE the form (e.g. in a Modal footer),
   * set this and reference the same id via `form="..."` on the button.
   * Without this, clicking the button does nothing in some browsers.
   */
  id?: string;
}) {
  return (
    <FormProvider {...methods}>
      <form
        id={id}
        onSubmit={methods.handleSubmit(onSubmit)}
        noValidate
        className={className}
        style={style}
      >
        {children}
      </form>
    </FormProvider>
  );
}

/**
 * Renders a labeled field with an inline error.
 * Wrap any input/select/textarea; error is pulled from RHF context by name.
 *
 *   <FormField label="Nama" name="name" required>
 *     <input className="clay-input" {...register("name")} />
 *   </FormField>
 */
export function FormField({
  label,
  name,
  required,
  hint,
  children,
}: {
  label: string;
  name: string;
  required?: boolean;
  hint?: string;
  children: ReactNode;
}) {
  const {
    formState: { errors },
  } = useFormContext();
  // Walk dotted path (e.g. "address.street")
  const err = name
    .split(".")
    .reduce<unknown>((acc, k) => (acc as Record<string, unknown> | null)?.[k] as unknown, errors);
  const message =
    err && typeof err === "object" && "message" in err
      ? String((err as { message?: unknown }).message ?? "")
      : "";

  return (
    <div className="clay-form-field">
      <label className="clay-label" htmlFor={name}>
        {label}
        {required && <span className="clay-required"> *</span>}
      </label>
      {children}
      {hint && !message && (
        <p className="clay-hint">{hint}</p>
      )}
      {message && <p className="clay-error">{message}</p>}
    </div>
  );
}

/**
 * Form-level error (e.g. API 4xx response not tied to a specific field).
 */
export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <div
      className="clay-card"
      style={{
        borderColor: "var(--pomegranate-400)",
        background: "#fff5f5",
        padding: "10px 14px",
        marginBottom: 12,
      }}
      role="alert"
    >
      ⚠ {message}
    </div>
  );
}
