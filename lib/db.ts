import { getCloudflareContext } from "@opennextjs/cloudflare";

export interface AppEnv {
  DB: D1Database;
  EMAIL_MODE?: string;
  SES_REGION?: string;
  SES_ACCESS_KEY_ID?: string;
  SES_SECRET_ACCESS_KEY?: string;
  SES_FROM_EMAIL?: string;
  SES_FROM_NAME?: string;
}

export async function getEnv(): Promise<AppEnv> {
  const { env } = await getCloudflareContext({ async: true });
  return env as unknown as AppEnv;
}

export interface PassType {
  id: string;
  name: string;
  description: string;
  color: string;
  created_at: string;
}

export interface Participant {
  id: string;
  name: string;
  email: string;
  pass_type_id: string;
  token: string;
  email_status: "pending" | "sent" | "failed" | "mocked";
  email_error: string | null;
  emailed_at: string | null;
  checked_in_at: string | null;
  created_at: string;
}

export interface ParticipantWithPass extends Participant {
  pass_name: string;
  pass_color: string;
}

export const PARTICIPANT_SELECT = `
  SELECT p.*, pt.name AS pass_name, pt.color AS pass_color
  FROM participants p JOIN pass_types pt ON pt.id = p.pass_type_id
`;
