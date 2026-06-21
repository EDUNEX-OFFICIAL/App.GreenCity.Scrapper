export type GenealogyTreeType = 'sponsor' | 'binary';

export type GenealogyLeg = 'left' | 'right' | 'sponsor' | 'unknown';

export interface GenealogyNodeRef {
  bpCode: string;
  bpName?: string;
  label?: string;
}

export interface GenealogyModalData {
  position?: string;
  leftPoint?: string;
  rightPoint?: string;
  selfPoint?: string;
  sponsorBpId?: string;
  sponsorName?: string;
  percentage?: string;
  totalMembers?: string;
  selfBusiness?: string;
  totalBusiness?: string;
  registeredAt?: string;
  statusDate?: string;
  plotStatus?: string;
  raw?: Record<string, string>;
}

export interface GenealogyJobPayload {
  moduleKey: 'genealogy_batch' | 'genealogy_bp';
  runId?: string;
  bpCode?: string;
  bpName?: string;
  uid?: string;
  password?: string;
  parentRunId?: string;
  triggeredBy?: string;
}

export type BpHarvestModuleName = 'profile' | 'genealogy';

export interface BpHarvestJobPayload {
  moduleKey: 'bp_harvest';
  runId?: string;
  bpCode: string;
  bpName?: string;
  uid?: string;
  password?: string;
  modules: BpHarvestModuleName[];
  parentRunId?: string;
}

export interface GenealogyScrapeResult {
  nodes: Array<{
    bpCode: string;
    bpName?: string;
    uid?: string;
    treeType: GenealogyTreeType;
    modalData: GenealogyModalData;
    children: GenealogyNodeRef[];
  }>;
  edges: Array<{
    parentBpCode: string;
    childBpCode: string;
    treeType: GenealogyTreeType;
    leg: GenealogyLeg;
  }>;
}
