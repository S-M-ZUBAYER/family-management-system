import type { FamilyRole } from "@/lib/family-access";

export type FamilyTheme = "heritage" | "emerald" | "indigo" | "terracotta";

export type WorkspacePayload = {
  family: {
    id: string;
    name_bn: string;
    name_en: string;
    theme: FamilyTheme;
  };
  viewer: {
    name: string;
    role: FamilyRole;
  };
  permissions: {
    canManageTheme: boolean;
  };
};
