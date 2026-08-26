import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
const email = process.env.SUPERADMIN_EMAIL;
const password = process.env.SUPERADMIN_PASSWORD;
const fullName = process.env.SUPERADMIN_NAME || "Super Admin";

if (!url || !secret || !email || !password) {
  console.error("Defina NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, SUPERADMIN_EMAIL e SUPERADMIN_PASSWORD.");
  process.exit(1);
}

const supabase = createClient(url, secret, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
});

const created = await supabase.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  app_metadata: { role: "super_admin", company_id: null },
  user_metadata: { full_name: fullName },
});

if (created.error || !created.data.user) {
  console.error("Erro ao criar SuperAdmin:", created.error?.message || "desconhecido");
  process.exit(1);
}

const profile = await supabase.from("profiles").insert({
  id: created.data.user.id,
  company_id: null,
  role: "super_admin",
  full_name: fullName,
});

if (profile.error) {
  await supabase.auth.admin.deleteUser(created.data.user.id);
  console.error("Erro ao criar perfil:", profile.error.message);
  process.exit(1);
}

console.log(`SuperAdmin criado: ${email}`);
