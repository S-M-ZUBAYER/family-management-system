export type PollStatus = "proposed" | "draft" | "open" | "closed" | "rejected" | "archived";
export type PollAudience = "family" | "admins";
export type ResultsVisibility = "live" | "after_close" | "admins";

export type PollOption = {
  id: string;
  poll_id: string;
  label: string;
  description: string | null;
  position: number;
  vote_count: number | null;
  percentage: number | null;
};

export type FamilyPoll = {
  id: string;
  title: string;
  description: string | null;
  category: "event" | "finance" | "welfare" | "property" | "qurbani" | "policy" | "general";
  decision_type: "advisory" | "binding" | "informal";
  voting_mode: "single" | "multiple" | "yes_no";
  max_choices: number;
  is_anonymous: boolean;
  results_visibility: ResultsVisibility;
  audience: PollAudience;
  quorum_percent: number;
  opens_at: string | null;
  closes_at: string | null;
  status: PollStatus;
  created_by_user_id: string;
  created_by_name: string;
  created_at: string;
  updated_at: string;
  options: PollOption[];
  eligible_voters: number;
  participant_count: number | null;
  quorum_reached: boolean | null;
  results_visible: boolean;
  has_voted: boolean;
  my_option_ids: string[];
  is_mine: boolean;
};

export type PollComment = {
  id: string;
  poll_id: string;
  body: string;
  author_user_id: string;
  author_name: string;
  status: "visible" | "hidden";
  created_at: string;
  is_mine: boolean;
};

export type FamilyDecision = {
  id: string;
  poll_id: string | null;
  title: string;
  summary: string;
  final_outcome: string;
  effective_date: string | null;
  status: "adopted" | "rejected" | "superseded" | "archived";
  decided_by_user_id: string;
  decided_by_name: string;
  created_at: string;
  updated_at: string;
};

export type GovernancePayload = {
  family?: { id: string; name_bn: string; name_en: string };
  viewer?: { displayName: string; role: string };
  polls?: FamilyPoll[];
  comments?: PollComment[];
  decisions?: FamilyDecision[];
  permissions?: { canManage: boolean };
  migrationRequired?: boolean;
  code?: string;
  error?: string;
};
