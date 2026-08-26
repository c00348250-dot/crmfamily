export type UserRole = "super_admin" | "store_admin" | "store_user" | "cashier";

export type AuthContext = {
  id: string;
  email: string | null;
  role: UserRole;
  companyId: string | null;
  fullName: string | null;
};

export type Company = {
  id: string;
  name: string;
  slug: string;
  business_type: string;
};
