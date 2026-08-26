import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/types";

function password() {
  return `${randomBytes(9).toString("base64url")}A1!`;
}

function storeRole(value: unknown): Extract<UserRole, "store_admin" | "store_user" | "cashier"> {
  if (value === "cashier") return "cashier";
  if (value === "store_user") return "store_user";
  return "store_admin";
}

export async function POST(request: Request) {
  try {
    await requireSuperAdmin();
    const body = await request.json();
    const fullName = String(body.fullName || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const companyId = String(body.companyId || "");
    const role = storeRole(body.role);
    if (!fullName || !email || !companyId) return NextResponse.json({ error: "Preencha nome, e-mail e empresa." }, { status: 400 });

    const caller = await createClient();
    const company = await caller.from("companies").select("id,name").eq("id", companyId).eq("is_active", true).single();
    if (company.error || !company.data) return NextResponse.json({ error: "Empresa inválida." }, { status: 400 });

    const generatedPassword = password();
    const admin = createAdminClient();
    const created = await admin.auth.admin.createUser({
      email,
      password: generatedPassword,
      email_confirm: true,
      app_metadata: { role, company_id: companyId },
      user_metadata: { full_name: fullName },
    });
    if (created.error || !created.data.user) return NextResponse.json({ error: created.error?.message ?? "Não foi possível criar o acesso." }, { status: 400 });

    const profile = await admin.from("profiles").insert({
      id: created.data.user.id,
      company_id: companyId,
      role,
      full_name: fullName,
    });
    if (profile.error) {
      await admin.auth.admin.deleteUser(created.data.user.id);
      return NextResponse.json({ error: profile.error.message }, { status: 400 });
    }

    return NextResponse.json({ password: generatedPassword, email, companyName: company.data.name, role });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro inesperado" }, { status: 401 });
  }
}

export async function PATCH(request: Request) {
  try {
    await requireSuperAdmin();
    const body = await request.json();
    const userId = String(body.userId || "");
    if (!userId) return NextResponse.json({ error: "Usuário inválido." }, { status: 400 });

    const caller = await createClient();
    const profile = await caller.from("profiles").select("id,company_id,role,full_name").eq("id", userId).single();
    if (profile.error || !profile.data || profile.data.role === "super_admin") {
      return NextResponse.json({ error: "Este acesso não pode ser redefinido por aqui." }, { status: 400 });
    }

    const generatedPassword = password();
    const admin = createAdminClient();
    const updated = await admin.auth.admin.updateUserById(userId, {
      password: generatedPassword,
      app_metadata: { role: profile.data.role, company_id: profile.data.company_id },
    });
    if (updated.error) return NextResponse.json({ error: updated.error.message }, { status: 400 });
    return NextResponse.json({ password: generatedPassword });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro inesperado" }, { status: 401 });
  }
}
