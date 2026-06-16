export interface StaffMember {
  readonly active: boolean;
  readonly initials: string;
  readonly name: string;
  readonly role: string;
}

export const staffMembers: readonly StaffMember[] = [
  { initials: "YB", name: "Yos Bb", role: "Manager", active: true },
  { initials: "RS", name: "Rina Sari", role: "Kasir Senior", active: true },
  { initials: "AF", name: "Ahmad Fauzi", role: "Kasir", active: true },
  { initials: "DL", name: "Dian Lestari", role: "Barista", active: false },
];
