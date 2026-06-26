export interface GenealogyTreeNode {
  bpCode: string;
  bpName?: string;
  leg?: 'left' | 'right' | 'sponsor';
  children: GenealogyTreeNode[];
}

export interface GenealogyResponse {
  bpCode: string;
  uid?: string;
  sponsorTree: GenealogyTreeNode[];
  binaryTree: GenealogyTreeNode[];
}
