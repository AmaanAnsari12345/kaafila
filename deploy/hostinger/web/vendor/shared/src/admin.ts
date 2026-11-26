export interface PlatformMetric {
  label: string;
  value: number | string;
  deltaPct?: number;
  status: "healthy" | "watch" | "critical";
}

export interface RevenueSnapshot {
  mrrMinor: number;
  currency: "INR" | "USD";
  activeSubscriptions: number;
  activeSeats: number;
  churnPct: number;
  adRevenueMinor: number;
}

export interface AdminOverview {
  users: number;
  newUsers7d: number;
  liveConvoys: number;
  activeVehicles: number;
  openSos: number;
  openReports: number;
  pendingMeetups: number;
  revenue: RevenueSnapshot;
  generatedAtIso: string;
}

export type AdminAction =
  | "user.suspend"
  | "user.unsuspend"
  | "user.role"
  | "convoy.force_end"
  | "sos.acknowledge"
  | "sos.resolve"
  | "report.resolve"
  | "report.reject"
  | "post.hide"
  | "post.restore"
  | "road_report.remove"
  | "meetup.approve"
  | "meetup.reject"
  | "announcement.create"
  | "announcement.delete"
  | "flag.upsert";
