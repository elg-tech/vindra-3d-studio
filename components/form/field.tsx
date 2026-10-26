"use client";

import { useId } from "react";
import type { FieldError, UseFormRegisterReturn } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type FieldShellProps = {
  label: string;
  hint?: React.ReactNode;
  error?: FieldError;
  className?: string;
  children: (ids: { id: string; describedBy?: string; invalid: boolean }) => React.ReactNode;
};

/** Label + controle + dica/erro, com os atributos de acessibilidade ligados. */
export function FieldShell({ label, hint, error, className, children }: FieldShellProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint && hintId, error && errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cn("grid content-start gap-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      {children({ id, describedBy, invalid: Boolean(error) })}
      {error ? (
        <p id={errorId} className="text-xs text-destructive">
          {error.message}
        </p>
      ) : (
        hint && (
          <p id={hintId} className="text-xs text-muted-foreground">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

type TextFieldProps = Omit<React.ComponentProps<"input">, "prefix"> & {
  label: string;
  registration: UseFormRegisterReturn;
  error?: FieldError;
  hint?: React.ReactNode;
  prefix?: string;
  suffix?: string;
  /** Campo numérico em formato brasileiro (aceita vírgula). */
  numeric?: boolean;
};

export function TextField({
  label,
  registration,
  error,
  hint,
  prefix,
  suffix,
  numeric,
  className,
  ...props
}: TextFieldProps) {
  return (
    <FieldShell label={label} hint={hint} error={error} className={className}>
      {({ id, describedBy, invalid }) => (
        <div className="relative">
          {prefix && (
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">
              {prefix}
            </span>
          )}
          <Input
            id={id}
            aria-invalid={invalid}
            aria-describedby={describedBy}
            inputMode={numeric ? "decimal" : undefined}
            autoComplete={numeric ? "off" : undefined}
            className={cn(numeric && "tabular-nums", prefix && "pl-10", suffix && "pr-12")}
            {...props}
            {...registration}
          />
          {suffix && (
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">
              {suffix}
            </span>
          )}
        </div>
      )}
    </FieldShell>
  );
}

export function TextAreaField({
  label,
  registration,
  error,
  hint,
  className,
  ...props
}: React.ComponentProps<"textarea"> & {
  label: string;
  registration: UseFormRegisterReturn;
  error?: FieldError;
  hint?: React.ReactNode;
}) {
  return (
    <FieldShell label={label} hint={hint} error={error} className={className}>
      {({ id, describedBy, invalid }) => (
        <Textarea id={id} aria-invalid={invalid} aria-describedby={describedBy} {...props} {...registration} />
      )}
    </FieldShell>
  );
}
