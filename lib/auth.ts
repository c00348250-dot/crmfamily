import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { AuthContext, UserRole } from "@/lib/types";

export async function getAuthContext(): Promise<AuthContext | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims as Record<string, unknown> | undefined;

  if (error || !claims?.sub) return null;

  const appMetadata = (claims.app_metadata ?? {}) as Record<string, unknown>;
  const userMetadata = (claims.user_metadata ?? {}) as Record<string, unknown>;
  const role = appMetadata.role as UserRole | undefined;
  const companyId = typeof appMetadata.company_id === "string" ? appMetadata.company_id : null;

  if (!role || !["super_admin", "store_admin", "store_user", "cashier"].includes(role)) return null;

  return {
    id: String(claims.sub),
    email: typeof claims.email === "string" ? claims.email : null,
    role,
    companyId,
    fullName: typeof userMetadata.full_name === "string" ? userMetadata.full_name : null,
  };
}

export async function requireUser() {
  const auth = await getAuthContext();
  if (!auth) redirect("/login");
  return auth;
}

export async function requireStoreUser() {
  const auth = await requireUser();
  if (auth.role === "cashier") redirect("/caixa");
  if (auth.role === "super_admin" || !auth.companyId) redirect("/dashboard");
  return auth;
}

export async function requireCashierUser() {
  const auth = await requireUser();
  if (auth.role === "super_admin" || !auth.companyId) redirect("/dashboard");
  if (!["cashier", "store_admin", "store_user"].includes(auth.role)) redirect("/dashboard");
  return auth;
}

export async function requireSuperAdmin() {
  const auth = await requireUser();
  if (auth.role !== "super_admin") redirect(auth.role === "cashier" ? "/caixa" : "/dashboard");
  return auth;
}
