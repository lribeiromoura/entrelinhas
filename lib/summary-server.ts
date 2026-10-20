import { db } from "./db";
import { createSummaryVersions } from "./summary-versions";
export const summaryVersions = createSummaryVersions(db);
