export type Session = {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number; // epoch seconds
  username: string;
  workbench: WorkbenchType;
  roles: string[];
};

export type WorkbenchType =
  | "ADMIN"
  | "USER"
  | "PARTNER"
  | "SERVICEMANAGER";

