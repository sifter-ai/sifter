import { apiFetchJson } from "../lib/apiFetch";

export interface Template {
  id: string;
  name: string;
  description: string;
  icon: string;
  instructions: string;
}

export const fetchTemplates = (): Promise<{ templates: Template[] }> =>
  apiFetchJson<{ templates: Template[] }>("/api/templates");
