export interface BpListItem {
  bpCode: string;
  name: string;
  mobile: string;
  status: string;
  sponsorCode: string;
  joiningDate: string;
  uid?: string;
  password?: string;
  commissionPct?: string;
  updatedAt: string;
}

export interface BpCandidate {
  uid: string;
  bpCode: string;
  name: string;
  sponsorCode: string;
  commissionPct?: string;
}

export interface BpDetail extends BpListItem {
  genealogy?: {
    sponsorName?: string;
    registeredAt?: string;
    position?: string;
    leftPoint?: string;
    rightPoint?: string;
    selfPoint?: string;
    selfBusiness?: string;
    totalBusiness?: string;
    totalMembers?: string;
  };
}
