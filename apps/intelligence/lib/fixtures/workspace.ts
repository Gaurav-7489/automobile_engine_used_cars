import type { Alert, ApiKey, AuditEvent, Campaign, Integration, Lead, PriceRequest, TeamMember } from "../domain";
import { lakh, rupees } from "../format";
import { daysBeforeSnapshot, ist, SNAPSHOT_AT } from "../time";

const at = (day: number, hh: number, mm = 0) => ist(2026, 10, day, hh, mm);

export const TEAM: TeamMember[] = [
  { id: "u-owner", name: "Arjun Rao", email: "owner@example.com", role: "owner", branchIds: ["koc", "tcr", "ccj"], mfa: true, status: "Active" },
  { id: "u-admin", name: "Admin 01", email: "admin01@example.com", role: "owner", branchIds: ["koc", "tcr", "ccj"], mfa: true, status: "Active" },
  { id: "u-manager", name: "Manager 01", email: "manager@example.com", role: "manager", branchIds: ["koc", "tcr"], mfa: true, status: "Active" },
  { id: "u-inventory", name: "Ops 01", email: "inventory@example.com", role: "inventory", branchIds: ["koc"], mfa: false, status: "Active" },
  { id: "u-marketing", name: "Marketing 01", email: "marketing@example.com", role: "marketing", branchIds: ["koc", "tcr", "ccj"], mfa: false, status: "Active" },
  { id: "u-sales", name: "Sales 01", email: "sales@example.com", role: "sales", branchIds: ["koc"], mfa: false, status: "Active" },
  { id: "u-sales2", name: "Sales 02", email: "sales02@example.com", role: "sales", branchIds: ["koc"], mfa: false, status: "Active" },
  { id: "u-sales3", name: "Sales 03", email: "sales03@example.com", role: "sales", branchIds: ["koc"], mfa: false, status: "Active" },
  { id: "u-finance", name: "Finance 01", email: "finance@example.com", role: "finance", branchIds: ["koc", "tcr", "ccj"], mfa: true, status: "Active" },
  { id: "u-viewer", name: "Viewer 01", email: "viewer@example.com", role: "viewer", branchIds: ["koc"], mfa: false, status: "Active" },
  { id: "u-invite", name: "Pending invitation", email: "new.hire@example.com", role: "sales", branchIds: ["tcr"], mfa: false, status: "Invited" },
];

const interaction = (id: string, atIso: string, type: Lead["interactions"][number]["type"], actor: string, detail: string, outcome?: string): Lead["interactions"][number] => ({ id, at: atIso, type, actor, detail, outcome });

const CONSENT = (evidence: string, atIso: string): Lead["consent"] => ({ marketing: false, service: true, evidence, capturedAt: atIso });

function lead(partial: Partial<Lead> & Pick<Lead, "id" | "name" | "source" | "stage" | "owner" | "vehicleId" | "createdAt" | "lastTouchAt" | "nextAction">): Lead {
  const n = partial.id.replace("L-", "");
  return {
    contactMasked: `+91 ••••• ••${n.slice(-3)}`, contactFull: `+91 90000 0${n.slice(-4).padStart(4, "0")}`, branchId: "koc", version: 1,
    consent: CONSENT("Website enquiry form: service-response consent", partial.createdAt), interactions: [], tasks: [], ...partial,
  };
}

export const LEADS: Lead[] = [
  lead({ id: "L-201", name: "Lead A", source: "Website", stage: "New", owner: "Sales 01", vehicleId: "V-1042", createdAt: at(19, 9, 50), lastTouchAt: at(19, 9, 50), nextAction: "Call 11:30", nextActionAt: at(19, 11, 30),
    interactions: [interaction("i-201-1", at(19, 9, 50), "System", "System", "Enquiry created from the V-1042 listing page (Website). Vehicle context preserved.")],
    tasks: [{ id: "t-201-1", title: "First response call", dueAt: at(19, 11, 30), done: false }] }),
  lead({ id: "L-202", name: "Lead B", source: "Search ad", stage: "Contacted", owner: "Sales 02", vehicleId: "V-1043", createdAt: at(18, 15, 10), lastTouchAt: at(19, 9, 0), nextAction: "Appointment", nextActionAt: at(20, 11, 0), campaignId: "CMP-3002",
    interactions: [interaction("i-202-1", at(18, 15, 10), "System", "System", "Enquiry created from search campaign CMP-3002."), interaction("i-202-2", at(19, 9, 0), "Call", "Sales 02", "Introductory call. Interested in a weekend visit.", "Connected")],
    tasks: [{ id: "t-202-1", title: "Propose appointment slot", dueAt: at(20, 11, 0), done: false }] }),
  lead({ id: "L-203", name: "Lead C", source: "Referral", stage: "Qualified", owner: "Sales 01", vehicleId: "V-1044", createdAt: at(17, 12, 0), lastTouchAt: at(19, 8, 0), nextAction: "Log outcome", nextActionAt: at(19, 12, 0), expectedGross: lakh(2.3),
    interactions: [interaction("i-203-1", at(19, 8, 0), "Call", "Sales 01", "Finance and exchange discussed.", "Connected")], tasks: [{ id: "t-203-1", title: "Log call outcome", dueAt: at(19, 12, 0), done: false }] }),
  lead({ id: "L-204", name: "Lead D", source: "Website", stage: "Appointment", owner: "Sales 03", vehicleId: "V-1047", createdAt: at(16, 11, 5), lastTouchAt: at(19, 8, 30), nextAction: "21 Oct / 11:00", nextActionAt: at(21, 11, 0),
    appointment: { id: "ap-204", at: at(21, 11, 0), kind: "Test drive", status: "Scheduled", staff: "Sales 03" },
    interactions: [interaction("i-204-1", at(19, 8, 30), "Appointment", "Sales 03", "Test drive scheduled for 21 Oct 11:00.")] }),
  lead({ id: "L-205", name: "Lead E", source: "Walk-in", stage: "Nurture", owner: "Sales 02", vehicleId: null, createdAt: at(12, 17, 0), lastTouchAt: at(18, 12, 0), nextAction: "Review 23 Oct", nextActionAt: at(23, 10, 0), nextActionTone: "warning",
    interactions: [interaction("i-205-1", at(18, 12, 0), "Note", "Sales 02", "Walk-in browsing. No vehicle selected: Unspecified interest.")], consent: { marketing: false, service: true, evidence: "In-person consent recorded at front desk", capturedAt: at(12, 17, 0) } }),
  lead({ id: "L-206", name: "Lead F", source: "Meta ad", stage: "New", owner: "Sales 01", vehicleId: "V-1042", createdAt: at(18, 20, 40), lastTouchAt: at(19, 9, 15), nextAction: "Overdue", nextActionAt: at(19, 9, 0), nextActionTone: "warning", campaignId: "CMP-3001",
    interactions: [interaction("i-206-1", at(18, 20, 40), "System", "System", "Enquiry created from Meta campaign CMP-3001.")], tasks: [{ id: "t-206-1", title: "First response", dueAt: at(19, 9, 0), done: false }] }),
  lead({ id: "L-207", name: "Lead G", source: "Referral", stage: "Nurture", owner: "Sales 02", vehicleId: "V-1046", createdAt: at(10, 13, 30), lastTouchAt: at(18, 14, 0), nextAction: "Review 25 Oct", nextActionAt: at(25, 10, 0), nextActionTone: "warning",
    interactions: [interaction("i-207-1", at(18, 14, 0), "Note", "Sales 02", "Waiting for the vehicle to complete preparation.")] }),
  lead({ id: "L-208", name: "Lead H", source: "Website", stage: "Contacted", owner: "Sales 03", vehicleId: "V-1042", createdAt: at(18, 18, 0), lastTouchAt: at(19, 7, 45), nextAction: "Log outcome", nextActionAt: at(19, 13, 0),
    interactions: [interaction("i-208-1", at(19, 7, 45), "Message", "Sales 03", "WhatsApp template sent with vehicle details.", "Queued")], tasks: [{ id: "t-208-1", title: "Log outcome", dueAt: at(19, 13, 0), done: false }] }),
  lead({ id: "L-209", name: "Lead I", source: "Search ad", stage: "New", owner: "Sales 02", vehicleId: "V-1043", createdAt: at(18, 9, 20), lastTouchAt: at(18, 9, 20), nextAction: "Overdue", nextActionAt: at(18, 11, 0), nextActionTone: "warning", campaignId: "CMP-3002",
    tasks: [{ id: "t-209-1", title: "First response", dueAt: at(18, 11, 0), done: false }], interactions: [interaction("i-209-1", at(18, 9, 20), "System", "System", "Enquiry created from search campaign CMP-3002.")] }),
  lead({ id: "L-210", name: "Lead J", source: "Website", stage: "Visited", owner: "Sales 01", vehicleId: "V-1044", createdAt: at(14, 10, 0), lastTouchAt: at(17, 16, 0), nextAction: "Send quote", nextActionAt: at(20, 10, 0),
    interactions: [interaction("i-210-1", at(17, 16, 0), "Appointment", "Sales 01", "Showroom visit completed.", "Visited")] }),
  lead({ id: "L-211", name: "Lead K", source: "Referral", stage: "Test drive", owner: "Sales 03", vehicleId: "V-1047", createdAt: at(13, 10, 0), lastTouchAt: at(18, 15, 0), nextAction: "Negotiation call", nextActionAt: at(20, 15, 0),
    interactions: [interaction("i-211-1", at(18, 15, 0), "Appointment", "Sales 03", "Test drive completed.", "Completed")] }),
  lead({ id: "L-212", name: "Lead L", source: "Website", stage: "Negotiation", owner: "Sales 01", vehicleId: "V-1045", createdAt: at(9, 10, 0), lastTouchAt: at(18, 11, 0), nextAction: "Confirm booking", nextActionAt: at(19, 16, 0), expectedGross: lakh(2.8),
    interactions: [interaction("i-212-1", at(18, 11, 0), "Call", "Sales 01", "Price discussed; vehicle reserved pending booking amount.", "Connected")] }),
  lead({ id: "L-213", name: "Lead M", source: "Walk-in", stage: "Contacted", owner: "Sales 02", vehicleId: "V-1048", createdAt: at(17, 11, 0), lastTouchAt: at(18, 10, 0), nextAction: "Call back", nextActionAt: at(20, 12, 0), interactions: [] }),
  lead({ id: "L-214", name: "Lead N", source: "Meta ad", stage: "Qualified", owner: "Sales 03", vehicleId: "V-1042", createdAt: at(15, 19, 0), lastTouchAt: at(18, 17, 30), nextAction: "Schedule visit", nextActionAt: at(20, 10, 30), interactions: [] }),
  lead({ id: "L-215", name: "Lead O", source: "Search ad", stage: "Lost", owner: "Sales 02", vehicleId: "V-1043", createdAt: at(8, 12, 0), lastTouchAt: at(15, 12, 0), nextAction: "—", lostReason: "Bought elsewhere", interactions: [] }),
  lead({ id: "L-216", name: "Lead P", source: "Website", stage: "Won", owner: "Sales 01", vehicleId: null, createdAt: at(2, 10, 0), lastTouchAt: at(10, 12, 0), nextAction: "—", saleId: "S-301", interactions: [] }),
  lead({ id: "L-217", name: "Lead Q", source: "Website", stage: "Contacted", owner: "Sales 03", vehicleId: "V-1050", createdAt: at(18, 13, 0), lastTouchAt: at(19, 6, 30), nextAction: "Appointment", nextActionAt: at(21, 10, 0), interactions: [] }),
  lead({ id: "L-218", name: "Lead R", source: "Referral", stage: "New", owner: "Sales 02", vehicleId: "V-1051", createdAt: at(19, 6, 10), lastTouchAt: at(19, 6, 10), nextAction: "Call 13:00", nextActionAt: at(19, 13, 0), interactions: [] }),
  lead({ id: "L-219", name: "Lead S", source: "Walk-in", stage: "Qualified", owner: "Sales 01", vehicleId: null, createdAt: at(11, 15, 0), lastTouchAt: at(17, 10, 0), nextAction: "Share options", nextActionAt: at(20, 17, 0), interactions: [] }),
  lead({ id: "L-220", name: "Lead T", source: "Referral", stage: "Visited", owner: "Sales 02", vehicleId: "V-1052", createdAt: at(12, 15, 0), lastTouchAt: at(16, 15, 0), nextAction: "Test drive", nextActionAt: at(21, 15, 0), interactions: [] }),
  lead({ id: "L-221", name: "Lead U", source: "Website", stage: "New", owner: "Sales 03", vehicleId: "V-1053", createdAt: at(19, 9, 5), lastTouchAt: at(19, 9, 5), nextAction: "Call 14:00", nextActionAt: at(19, 14, 0), interactions: [] }),
  lead({ id: "L-222", name: "Lead V", source: "Search ad", stage: "Nurture", owner: "Sales 01", vehicleId: "V-1054", createdAt: at(5, 12, 0), lastTouchAt: at(15, 12, 0), nextAction: "Review 27 Oct", nextActionAt: at(27, 10, 0), interactions: [] }),
  lead({ id: "L-223", name: "Lead A", source: "Website", stage: "New", owner: "Sales 02", vehicleId: "V-1042", createdAt: at(19, 9, 55), lastTouchAt: at(19, 9, 55), nextAction: "Merge review", nextActionAt: at(19, 12, 0), duplicateOf: "L-201", interactions: [interaction("i-223-1", at(19, 9, 55), "System", "System", "Possible duplicate of L-201 (same contact and vehicle within the dedupe window).")] }),
  lead({ id: "L-224", name: "Lead W", source: "Referral", stage: "Contacted", owner: "Sales 03", branchId: "tcr", vehicleId: "T-2003", createdAt: at(17, 12, 0), lastTouchAt: at(18, 16, 0), nextAction: "Call back", nextActionAt: at(20, 11, 0), interactions: [] }),
  lead({ id: "L-225", name: "Lead X", source: "Website", stage: "New", owner: "Sales 02", branchId: "ccj", vehicleId: "K-2004", createdAt: at(19, 8, 0), lastTouchAt: at(19, 8, 0), nextAction: "Call 12:30", nextActionAt: at(19, 12, 30), interactions: [] }),
];

const a = (partial: Omit<Alert, "history" | "occurrences" | "firstSeen" | "lastSeen" | "status" | "branchId"> & Partial<Pick<Alert, "firstSeen" | "lastSeen" | "occurrences" | "status" | "branchId">>): Alert => ({
  status: "Open", branchId: "koc", occurrences: 1, firstSeen: partial.dueAt ?? SNAPSHOT_AT, lastSeen: SNAPSHOT_AT, history: [{ at: partial.firstSeen ?? SNAPSHOT_AT, actor: "Rule engine", action: "Alert raised" }], ...partial,
});

export const ALERTS: Alert[] = [
  a({ id: "A-403", type: "Integration", severity: "Critical", title: "Source sync stale", recordRef: "Feed A", recordKind: "integration", trigger: "No success in 24h", owner: "Admin 01", assignee: "Admin 01", dueAt: at(19, 10, 0), dueLabel: "Now", actionLabel: "Inspect", firstSeen: at(18, 9, 10), occurrences: 4 }),
  a({ id: "A-401", type: "Pricing", severity: "Warning", title: "Price review", recordRef: "V-1043", recordKind: "vehicle", trigger: "45d stock; low enquiries", owner: "Manager 01", assignee: "Manager 01", dueAt: at(19, 17, 0), dueLabel: "Today", actionLabel: "Review", firstSeen: at(18, 10, 0), occurrences: 2 }),
  a({ id: "A-402", type: "Leads", severity: "Due today", title: "Lead follow-up", recordRef: "L-201", recordKind: "lead", trigger: "First response pending", owner: "Sales 01", assignee: "Sales 01", dueAt: at(19, 11, 30), dueLabel: "11:30", actionLabel: "Open", firstSeen: at(19, 9, 50) }),
  a({ id: "A-404", type: "Integration", severity: "Warning", title: "Price sync failed", recordRef: "V-1044", recordKind: "vehicle", trigger: "Owned site retry needed", owner: "Admin 01", assignee: "Admin 01", dueAt: at(19, 18, 0), dueLabel: "Today", actionLabel: "Inspect", firstSeen: at(19, 8, 20) }),
  a({ id: "A-405", type: "Documents", severity: "Info", title: "Document check", recordRef: "V-1047", recordKind: "vehicle", trigger: "Inspection not supplied", owner: "Ops 01", assignee: "Ops 01", dueAt: at(20, 10, 0), dueLabel: "Tomorrow", actionLabel: "View", firstSeen: at(17, 10, 0) }),
  a({ id: "A-406", type: "Leads", severity: "Overdue", title: "Lead response overdue", recordRef: "L-206", recordKind: "lead", trigger: "First response SLA breached", owner: "Sales 01", assignee: "Sales 01", dueAt: at(19, 9, 0), dueLabel: "Overdue", actionLabel: "Open", firstSeen: at(19, 9, 0) }),
  a({ id: "A-407", type: "Leads", severity: "Overdue", title: "Lead response overdue", recordRef: "L-209", recordKind: "lead", trigger: "First response SLA breached", owner: "Sales 02", assignee: "Sales 02", dueAt: at(18, 11, 0), dueLabel: "Overdue", actionLabel: "Open", firstSeen: at(18, 11, 0), occurrences: 3 }),
  a({ id: "A-408", type: "Approvals", severity: "Info", title: "Price request awaiting approval", recordRef: "PR-7003", recordKind: "price-request", trigger: "Pending since 18 Oct", owner: "Arjun Rao", assignee: "Arjun Rao", dueAt: at(20, 12, 0), dueLabel: "Tomorrow", actionLabel: "Review", waiting: true, firstSeen: at(18, 16, 0) }),
  a({ id: "A-409", type: "Approvals", severity: "Info", title: "Campaign budget awaiting approval", recordRef: "CMP-3002", recordKind: "campaign", trigger: "Submitted for approval", owner: "Arjun Rao", assignee: "Arjun Rao", dueAt: at(21, 12, 0), dueLabel: "In 2 d", actionLabel: "Review", waiting: true, firstSeen: at(19, 8, 0) }),
  a({ id: "A-410", type: "Approvals", severity: "Info", title: "Platform acknowledgement pending", recordRef: "CMP-3003", recordKind: "campaign", trigger: "Pause requested; awaiting provider", owner: "Marketing 01", assignee: "Marketing 01", dueAt: at(20, 9, 0), dueLabel: "Tomorrow", actionLabel: "View", waiting: true, firstSeen: at(19, 9, 30) }),
  a({ id: "A-411", type: "Leads", severity: "Due today", title: "Test drive confirmation", recordRef: "L-204", recordKind: "lead", trigger: "Confirm appointment with customer", owner: "Sales 03", assignee: "Sales 03", dueAt: at(19, 15, 0), dueLabel: "Today", actionLabel: "Open", firstSeen: at(19, 8, 30) }),
  a({ id: "A-412", type: "Leads", severity: "Info", title: "Possible duplicate lead", recordRef: "L-223", recordKind: "lead", trigger: "Matches L-201 within dedupe window", owner: "Sales 02", assignee: "Sales 02", dueAt: at(19, 12, 0), dueLabel: "Today", actionLabel: "Review", firstSeen: at(19, 9, 55), status: "Snoozed", snoozeUntil: at(20, 9, 0), snoozeReason: "Waiting for customer reply" }),
  a({ id: "A-398", type: "Documents", severity: "Info", title: "Registration document check", recordRef: "V-1051", recordKind: "vehicle", trigger: "Document not supplied", owner: "Ops 01", assignee: "Ops 01", dueAt: at(17, 10, 0), dueLabel: "Resolved", actionLabel: "View", status: "Resolved", firstSeen: at(15, 10, 0), resolution: { code: "doc-added", note: "Registration certificate uploaded.", at: at(17, 11, 0), by: "Ops 01" } }),
];

const sync = (channel: string, status: "Applied" | "Failed" | "Queued", atIso: string, extra: Partial<{ syncId: string; error: string }> = {}) => ({ channel, status, at: atIso, ...extra });

export const PRICE_REQUESTS: PriceRequest[] = [
  {
    id: "PR-7003", vehicleId: "V-1047", vehicleVersion: 1, status: "Pending", currentAsking: lakh(26.0), proposedAsking: lakh(25.4), estimate: lakh(25.6), rangeLow: lakh(24.9), rangeHigh: lakh(26.4), landed: lakh(24.0), holdingSelling: lakh(0.2),
    reason: "Enquiries below cohort median; align with market estimate", requestedBy: "u-manager", requestedByName: "Manager 01", requestedAt: at(18, 16, 0), evidenceAt: at(18, 15, 40), evidenceN: 14, evidenceTier: "Moderate", methodVersion: "valuation-v1.0",
    userEdited: false, belowFloor: false, channelScope: ["Owned site"], syncs: [], history: [{ at: at(18, 16, 0), actor: "Manager 01", action: "Submitted for approval" }],
  },
  {
    id: "PR-7002", vehicleId: "V-1044", vehicleVersion: 2, status: "PartiallySynced", currentAsking: lakh(36.0), proposedAsking: lakh(35.0), estimate: lakh(35.2), rangeLow: lakh(34.1), rangeHigh: lakh(36.4), landed: lakh(32.7), holdingSelling: lakh(0.3),
    reason: "Align with estimate after 18 days and two comparable price cuts", requestedBy: "u-manager", requestedByName: "Manager 01", requestedAt: at(17, 11, 0), approverName: "Arjun Rao", approvedBy: "u-owner", decidedAt: at(18, 9, 0),
    evidenceAt: at(17, 10, 40), evidenceN: 16, evidenceTier: "Moderate", methodVersion: "valuation-v1.0", userEdited: false, belowFloor: false, channelScope: ["Owned site", "Feed export"],
    syncs: [sync("Feed export", "Applied", at(18, 9, 2), { syncId: "SY-5501" }), sync("Owned site", "Failed", at(19, 8, 20), { syncId: "SY-5502", error: "Owned site returned a timeout; retry needed" })],
    history: [{ at: at(17, 11, 0), actor: "Manager 01", action: "Submitted for approval" }, { at: at(18, 9, 0), actor: "Arjun Rao", action: "Approved" }, { at: at(18, 9, 1), actor: "System", action: "Internal price applied (version 2)" }, { at: at(19, 8, 20), actor: "System", action: "Owned site sync failed" }],
  },
  {
    id: "PR-7001", vehicleId: "V-1042", vehicleVersion: 1, status: "Rejected", currentAsking: lakh(28.5), proposedAsking: lakh(27.5), estimate: lakh(29.2), rangeLow: lakh(26.8), rangeHigh: lakh(31.5), landed: lakh(26.0), holdingSelling: lakh(0.2),
    reason: "Test a lower asking to lift enquiries", requestedBy: "u-manager", requestedByName: "Manager 01", requestedAt: at(14, 12, 0), approverName: "Arjun Rao", approvedBy: "u-owner", decidedAt: at(14, 15, 30), rejectReason: "Asking is below the model estimate and enquiries are healthy; hold price.",
    evidenceAt: at(14, 11, 40), evidenceN: 18, evidenceTier: "Moderate", methodVersion: "valuation-v1.0", userEdited: true, belowFloor: false, channelScope: ["Owned site"], syncs: [],
    history: [{ at: at(14, 12, 0), actor: "Manager 01", action: "Submitted for approval" }, { at: at(14, 15, 30), actor: "Arjun Rao", action: "Rejected", detail: "Asking is below the model estimate and enquiries are healthy; hold price." }],
  },
];

const channelsDefault = (search: number, meta: number): Campaign["channels"] => [
  { id: "search", enabled: search > 0, budget: rupees(search) }, { id: "meta", enabled: meta > 0, budget: rupees(meta) }, { id: "owned", enabled: false, budget: 0 }, { id: "marketplace", enabled: false, budget: 0 },
];

export const CAMPAIGNS: Campaign[] = [
  {
    id: "CMP-3002", name: "Mercedes-Benz E220d / Kochi", vehicleId: "V-1043", vehicleVersion: 12, objective: "Enquiries", status: "Draft", step: 3, region: "Kochi + 40 km", radiusKm: 40,
    startDate: "2026-10-20", endDate: "2026-11-18", channels: channelsDefault(9000, 6000), totalCap30d: rupees(15000), dailyCap: rupees(500),
    headline: "E220d / Kochi", body: "2018 diesel automatic. 62,000 km. Asking ₹26.8 L. Request vehicle details.", creativeApproved: false, budgetApproved: false,
    utm: "vl_cmp-3002_v-1043", clickWindowDays: 7, viewWindowDays: 1, createdBy: "u-marketing", createdByName: "Marketing 01", note: "Reason: 45 days in stock and 2 enquiries in 14 days. Budget experiment; outcomes unknown.",
    history: [{ at: at(19, 8, 0), actor: "Marketing 01", action: "Draft created from price-review evidence" }],
  },
  {
    id: "CMP-3001", name: "BMW 520d / Kochi (test)", vehicleId: "V-1042", vehicleVersion: 1, objective: "Enquiries", status: "Completed", step: 5, region: "Kochi + 40 km", radiusKm: 40,
    startDate: "2026-09-20", endDate: "2026-10-04", channels: channelsDefault(3000, 1500), totalCap30d: rupees(15000), dailyCap: rupees(500),
    headline: "BMW 520d Luxury Line / Kochi", body: "2019 diesel automatic. 58,000 km. 1 owner. Request vehicle details.", creativeApproved: true, budgetApproved: true, approvedVersion: 1,
    utm: "vl_cmp-3001_v-1042", clickWindowDays: 7, viewWindowDays: 1, createdBy: "u-marketing", createdByName: "Marketing 01", note: "Completed historical test. Illustrative performance sample.",
    metrics: {
      spend: rupees(4500), clicks: 300, leads: 9, qualified: 3, testDrives: 1,
      byChannel: [{ channel: "Search", spend: rupees(3000), clicks: 190, leads: 6 }, { channel: "Meta", spend: rupees(1500), clicks: 110, leads: 3 }],
      daily: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map((d) => ({ date: new Date(Date.UTC(2026, 8, 20 + d)).toISOString().slice(0, 10), spend: rupees([260, 310, 340, 380, 330, 300, 280, 350, 360, 310, 340, 300, 330, 310][d]), leads: [0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1, 1, 1, 1][d] })),
    },
    history: [{ at: daysBeforeSnapshot(29), actor: "Marketing 01", action: "Draft created" }, { at: daysBeforeSnapshot(28), actor: "Arjun Rao", action: "Approved budget and creative" }, { at: daysBeforeSnapshot(15), actor: "System", action: "Campaign completed" }],
  },
  {
    id: "CMP-3003", name: "Audi Q5 / Kochi", vehicleId: "V-1044", vehicleVersion: 2, objective: "Test-drive requests", status: "Pausing", step: 5, region: "Kochi + 40 km", radiusKm: 40,
    startDate: "2026-10-12", endDate: "2026-11-10", channels: channelsDefault(5000, 0), totalCap30d: rupees(10000), dailyCap: rupees(350),
    headline: "Audi Q5 Premium Plus / Kochi", body: "2020 diesel automatic. 48,000 km. 1 owner. Book a test drive.", creativeApproved: true, budgetApproved: true, approvedVersion: 2,
    utm: "vl_cmp-3003_v-1044", clickWindowDays: 7, viewWindowDays: 1, createdBy: "u-marketing", createdByName: "Marketing 01", platformAck: "awaiting", note: "Pause requested by Marketing 01. Pending until the platform acknowledges.",
    history: [{ at: at(12, 10, 0), actor: "Arjun Rao", action: "Approved budget and creative" }, { at: at(19, 9, 30), actor: "Marketing 01", action: "Pause requested" }],
  },
];

export const INTEGRATIONS: Integration[] = [
  {
    id: "feed-a", name: "Licensed feed A", kind: "Licensed feed", state: "Connected", lastSuccessAt: at(19, 9, 10), scopes: "Scopes: review before connect", detail: "Last success 09:10 IST", branchScope: "Kochi", cadence: "every 6h", freshnessSla: "24h", received: 18, rejected: 2, lastJob: "J-901",
    logs: [
      { id: "J-901", at: at(19, 9, 10), job: "J-901", received: 18, rejected: 2, status: "Partial", rejectedRows: [{ row: 7, reason: "Missing variant" }, { row: 12, reason: "Asking price is not a number" }] },
      { id: "J-900", at: at(19, 3, 10), job: "J-900", received: 20, rejected: 0, status: "Success" },
      { id: "J-899", at: at(18, 21, 10), job: "J-899", received: 19, rejected: 1, status: "Partial", rejectedRows: [{ row: 3, reason: "Duplicate provider ID" }] },
    ],
  },
  { id: "ads", name: "Advertising account", kind: "Advertising account", state: "Not configured", lastSuccessAt: null, scopes: "Scopes: review before connect", detail: "Connect to publish ads", branchScope: "Kochi", cadence: "—", freshnessSla: "—", received: 0, rejected: 0, lastJob: "—", logs: [] },
  {
    id: "publishing", name: "Inventory publishing", kind: "Inventory publishing", state: "Degraded", lastSuccessAt: at(19, 8, 20), scopes: "Scopes: review before connect", detail: "One channel needs retry", branchScope: "Kochi", cadence: "on change", freshnessSla: "1h", received: 2, rejected: 1, lastJob: "SY-5502",
    logs: [
      { id: "SY-5502", at: at(19, 8, 20), job: "SY-5502", received: 1, rejected: 1, status: "Failed", rejectedRows: [{ row: 1, reason: "Owned site returned a timeout; retry needed" }] },
      { id: "SY-5501", at: at(18, 9, 2), job: "SY-5501", received: 1, rejected: 0, status: "Success" },
    ],
  },
];

export const API_KEYS: ApiKey[] = [
  { id: "k-1", name: "Owned site stock sync", scope: "inventory:read", branch: "Kochi", expiresAt: at(31, 0, 0), prefix: "vl_live_8f3a", revoked: false, createdAt: at(1, 10, 0) },
];

export const AUDIT: AuditEvent[] = [
  { id: "AU-9001", at: at(18, 9, 1), actor: "System", action: "price.applied", target: "V-1044", detail: "PR-7002: ₹36.0 L → ₹35.0 L (version 2)" },
  { id: "AU-9000", at: at(18, 9, 0), actor: "Arjun Rao", action: "price_request.approved", target: "PR-7002", detail: "Distinct approver confirmed old/new asking and channels" },
  { id: "AU-8999", at: at(17, 11, 0), actor: "Manager 01", action: "price_request.submitted", target: "PR-7002", detail: "Evidence snapshot attached" },
  { id: "AU-8998", at: at(14, 15, 30), actor: "Arjun Rao", action: "price_request.rejected", target: "PR-7001", detail: "Reason recorded" },
];
