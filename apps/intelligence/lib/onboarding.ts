export type OnboardingDraft = {
  step: number;
  business: { legalName: string; displayName: string; state: string; city: string; timezone: string; gstin: string };
  branch: { name: string; city: string; state: string; timezone: string; address: string; isDefault: boolean };
  invites: { email: string; role: string; branchId: string }[];
  data: "import" | "later" | "skip";
};

/** The workspace is provisioned before onboarding, so the draft starts from its real record; nothing is invented. */
export const emptyDraft = (workspace?: { legalName: string; displayName: string; gstin: string; timezone: string; branch?: { name: string; city: string; state: string; timezone: string } }): OnboardingDraft => ({
  step: 1,
  business: { legalName: workspace?.legalName ?? "", displayName: workspace?.displayName ?? "", state: workspace?.branch?.state ?? "", city: workspace?.branch?.city ?? "", timezone: workspace?.timezone ?? "Asia/Kolkata", gstin: workspace?.gstin ?? "" },
  branch: { name: workspace?.branch?.name ?? "", city: workspace?.branch?.city ?? "", state: workspace?.branch?.state ?? "", timezone: workspace?.branch?.timezone ?? "Asia/Kolkata", address: "", isDefault: true },
  invites: [],
  data: "later",
});

export const STEPS = [
  { key: "business", label: "Business", hint: "Legal and display details", title: "Tell us about your business" },
  { key: "branch", label: "Branch", hint: "Create your first branch", title: "Create your first branch" },
  { key: "team", label: "Team", hint: "Assign scoped roles", title: "Invite your team" },
  { key: "data", label: "Data", hint: "Import or connect later", title: "Bring in your data" },
  { key: "review", label: "Review", hint: "Confirm and activate", title: "Review and activate" },
] as const;

const TZ = /^[A-Za-z_]+\/[A-Za-z_]+$/;
const GSTIN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/** Server and client share these rules: required business fields cannot be skipped. */
export function validateStep(step: number, draft: OnboardingDraft): Record<string, string> {
  const e: Record<string, string> = {};
  const t = (v: string) => v.trim();
  if (step === 1) {
    if (!t(draft.business.legalName)) e.legalName = "Enter the legal business name.";
    if (!t(draft.business.displayName)) e.displayName = "Enter the display name.";
    if (!t(draft.business.state)) e.state = "Enter the state.";
    if (!t(draft.business.city)) e.city = "Enter the city.";
    if (!TZ.test(t(draft.business.timezone))) e.timezone = "Choose a valid timezone, for example Asia/Kolkata.";
    if (t(draft.business.gstin) && !GSTIN.test(t(draft.business.gstin).toUpperCase())) e.gstin = "Enter a valid 15-character GSTIN or leave it blank.";
  }
  if (step === 2) {
    if (!t(draft.branch.name)) e.branchName = "Enter the branch display name.";
    if (!t(draft.branch.city)) e.branchCity = "Enter the city.";
    if (!t(draft.branch.state)) e.branchState = "Enter the state.";
    if (!TZ.test(t(draft.branch.timezone))) e.branchTimezone = "Choose a valid timezone, for example Asia/Kolkata.";
  }
  if (step === 3) {
    draft.invites.forEach((invite, i) => {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t(invite.email))) e[`invite${i}`] = `Invite ${i + 1}: enter a valid email address.`;
      else if (!invite.role) e[`invite${i}`] = `Invite ${i + 1}: choose a role.`;
    });
  }
  return e;
}
