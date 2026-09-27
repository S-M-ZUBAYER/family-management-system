export type ArchiveVisibility = "family" | "admins" | "private";

export type ArchiveCollection = {
  id: string;
  name: string;
  description: string | null;
  collection_type: "album" | "heritage" | "documents" | "property" | "time_capsule" | "other";
  cover_color: string;
  visibility: ArchiveVisibility;
  status: "active" | "archived";
  created_by_user_id: string;
  created_by_name: string;
  created_at: string;
  is_mine: boolean;
};

export type ArchiveMemory = {
  id: string;
  collection_id: string;
  title: string;
  description: string | null;
  memory_type: "photo" | "video" | "audio" | "document" | "object" | "other";
  memory_date: string | null;
  place: string | null;
  people_tags: string[];
  visibility: ArchiveVisibility;
  status: "active" | "archived";
  uploaded_by_user_id: string;
  uploaded_by_name: string;
  created_at: string;
  is_mine: boolean;
};

export type ArchiveStory = {
  id: string;
  title: string;
  content: string;
  story_date: string | null;
  storyteller: string | null;
  people_tags: string[];
  place: string | null;
  visibility: "family" | "admins";
  status: "draft" | "pending" | "published" | "archived";
  author_user_id: string;
  author_name: string;
  created_at: string;
  updated_at: string;
  is_mine: boolean;
};

export type VaultDocument = {
  id: string;
  title: string;
  category: "property_deed" | "nid" | "passport" | "birth_certificate" | "legal" | "financial" | "insurance" | "education" | "other";
  owner_name: string | null;
  document_number_masked: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  issuer: string | null;
  notes: string | null;
  visibility: ArchiveVisibility;
  uploaded_by_user_id: string;
  uploaded_by_name: string;
  created_at: string;
  updated_at: string;
  is_mine: boolean;
};

export type FamilyAsset = {
  id: string;
  title: string;
  asset_type: "land" | "house" | "flat" | "vehicle" | "business" | "investment" | "jewelry" | "other";
  ownership: string | null;
  location: string | null;
  identifier_masked: string | null;
  acquisition_date: string | null;
  estimated_value: number | string;
  notes: string | null;
  visibility: "family" | "admins";
  status: "active" | "disputed" | "sold" | "inactive";
  created_at: string;
  updated_at: string;
};

export type TimeCapsule = {
  id: string;
  title: string;
  message: string | null;
  recipient_names: string | null;
  unlock_at: string;
  visibility: "family" | "admins";
  status: "locked" | "opened" | "cancelled";
  created_by_user_id: string;
  created_by_name: string;
  opened_at: string | null;
  created_at: string;
  is_mine: boolean;
  is_unlocked: boolean;
};

export type ArchiveFile = {
  id: string;
  entity_type: "memory" | "vault_document";
  entity_id: string;
  file_name: string;
  mime_type: string;
  file_size: number;
  visibility: ArchiveVisibility;
  uploaded_by_user_id: string;
  uploaded_by_name: string;
  created_at: string;
  is_mine: boolean;
};

export type ArchivePayload = {
  family?: { id: string; name_bn: string; name_en: string };
  viewer?: { displayName: string; role: string };
  collections?: ArchiveCollection[];
  memories?: ArchiveMemory[];
  stories?: ArchiveStory[];
  documents?: VaultDocument[];
  assets?: FamilyAsset[];
  capsules?: TimeCapsule[];
  files?: ArchiveFile[];
  permissions?: { canManage: boolean };
  migrationRequired?: boolean;
  code?: string;
  error?: string;
};
