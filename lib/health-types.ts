export type HealthProfile = {
  id: string;
  member_name: string;
  blood_group: string | null;
  date_of_birth: string | null;
  height_cm: number | string | null;
  weight_kg: number | string | null;
  conditions: string | null;
  allergies: string | null;
  emergency_notes: string | null;
  doctor_name: string | null;
  doctor_phone: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  donor_available: boolean;
  last_donation_date: string | null;
  visibility: "private" | "emergency" | "family";
  updated_at: string;
};

export type HealthMedication = {
  id: string;
  medicine_name: string;
  dosage: string;
  frequency: string;
  reminder_times: string[];
  start_date: string;
  end_date: string | null;
  instructions: string | null;
  prescribing_doctor: string | null;
  status: "active" | "paused" | "completed";
  created_at: string;
  updated_at: string;
};

export type HealthAppointment = {
  id: string;
  title: string;
  doctor_name: string | null;
  facility: string | null;
  scheduled_at: string;
  reminder_minutes: number;
  status: "scheduled" | "completed" | "cancelled";
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type HealthMeasurement = {
  id: string;
  measurement_type: "blood_pressure" | "blood_sugar" | "pulse" | "temperature" | "weight" | "oxygen";
  value_primary: number | string;
  value_secondary: number | string | null;
  unit: string;
  measured_at: string;
  notes: string | null;
  created_at: string;
};

export type HealthDocument = {
  id: string;
  file_name: string;
  mime_type: string;
  file_size: number;
  category: "prescription" | "lab_report" | "imaging" | "vaccine" | "insurance" | "other";
  title: string;
  document_date: string | null;
  notes: string | null;
  created_at: string;
};

export type EmergencyHealthProfile = {
  member_name: string;
  blood_group: string | null;
  conditions: string | null;
  allergies: string | null;
  emergency_notes: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  donor_available: boolean;
  last_donation_date: string | null;
  visibility: "private" | "emergency" | "family";
};

export type HealthSosAlert = {
  id: string;
  reporter_name: string;
  alert_type: "medical" | "accident" | "fire" | "safety" | "other";
  message: string;
  preferred_contact: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
  location_accuracy_m: number | string | null;
  location_label: string | null;
  status: "active" | "acknowledged" | "resolved" | "cancelled";
  acknowledged_by_name: string | null;
  acknowledged_at: string | null;
  resolved_at: string | null;
  resolution_note: string | null;
  created_at: string;
  updated_at: string;
  is_reporter: boolean;
};

export type HealthSosResponse = {
  id: string;
  alert_id: string;
  responder_name: string;
  response_type: "acknowledged" | "on_the_way" | "called_emergency" | "update" | "resolved";
  note: string | null;
  created_at: string;
  is_mine: boolean;
};

export type HealthPayload = {
  family?: { id: string; name_bn: string; name_en: string };
  viewer?: { displayName: string; role: string };
  profile?: HealthProfile | null;
  medications?: HealthMedication[];
  appointments?: HealthAppointment[];
  measurements?: HealthMeasurement[];
  documents?: HealthDocument[];
  emergencyDirectory?: EmergencyHealthProfile[];
  sosAlerts?: HealthSosAlert[];
  sosResponses?: HealthSosResponse[];
  permissions?: { canManageSos: boolean };
  migrationRequired?: boolean;
  code?: string;
  error?: string;
};
