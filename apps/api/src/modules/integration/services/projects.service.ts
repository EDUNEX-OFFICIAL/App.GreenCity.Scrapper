import type { ProjectItem } from '../dto/projects.dto';
import { mapProjectRow } from '../mappers/field-mappers';
import { RawModuleRepository } from '../repositories/raw-module.repository';

export const ProjectsService = {
  async list(params: {
    page: number;
    limit: number;
    updatedAfter?: Date;
  }): Promise<{ items: ProjectItem[]; total: number }> {
    const [rows, total] = await Promise.all([
      RawModuleRepository.listProjects(params),
      RawModuleRepository.countProjects({ updatedAfter: params.updatedAfter }),
    ]);
    const items = rows
      .map((r, i) =>
        mapProjectRow(
          r.rowJson,
          r.lastSeenAt,
          r.rowJson['Name']?.trim() || r.rowJson['SrNo']?.trim() || r.id || String(i),
        ),
      )
      .filter((p) => p.name);
    return { items, total };
  },
};
