"use client";

import { FormEvent, ReactNode, useState } from "react";
import { useRouter } from "next/navigation";

type ActionResult = void | { ok?: boolean; error?: string };

type SafeActionFormProps = {
  action: (formData: FormData) => Promise<ActionResult>;
  children: ReactNode;
  className?: string;
  successMessage?: string;
  resetOnSuccess?: boolean;
};

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Não foi possível concluir a operação. Tente novamente.";
}

export function SafeActionForm({ action, children, className, successMessage, resetOnSuccess = true }: SafeActionFormProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);

    setPending(true);
    setError("");
    setSuccess("");

    try {
      const result = await action(formData);
      if (result && result.ok === false) {
        setError(result.error ?? "Não foi possível concluir a operação. Revise os dados e tente novamente.");
        return;
      }

      if (resetOnSuccess) form.reset();
      setSuccess(successMessage ?? "Operação concluída com sucesso.");
      router.refresh();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPending(false);
    }
  }

  return (
    <form className={className} onSubmit={submit} aria-busy={pending}>
      {children}
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {success ? <p className="access-result" role="status">{success}</p> : null}
    </form>
  );
}
