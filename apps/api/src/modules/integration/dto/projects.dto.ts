export interface ProjectItem {
  id: string;
  name: string;
  company?: string;
  address?: string;
  startDate?: string;
  updatedAt: string;
  raw?: Record<string, string>;
}
