import type { Branch } from "../domain";

export const BRANCHES: Branch[] = [
  { id: "koc", name: "Kochi branch", city: "Kochi", state: "Kerala", timezone: "Asia/Kolkata", isDefault: true },
  { id: "tcr", name: "Thrissur branch", city: "Thrissur", state: "Kerala", timezone: "Asia/Kolkata" },
  { id: "ccj", name: "Kozhikode branch", city: "Kozhikode", state: "Kerala", timezone: "Asia/Kolkata" },
];

export const DEFAULT_BRANCH = "koc";
export const ALL_BRANCHES = "all";

export const TENANT = { id: "t-sample-motors", name: "Sample Motors", legalName: "Sample Motors Private Limited" };
