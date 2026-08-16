import { reconstructNormalizedProjectsFromLegacy } from "../server/services/googleSheetsService.js";
import { toLegacyProjectView } from "../server/services/projectViewAdapter.js";
import type { NormalizedProject } from "../server/services/projectNormalizer.js";
import type { Project } from "../src/types.js";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function runTest(name: string, fn: () => void) {
  console.log(`[LEGACY_RECONSTRUCTION] Running: ${name}...`);
  fn();
  console.log("[LEGACY_RECONSTRUCTION] ✓ Passed\n");
}

function projectFixture(overrides: Partial<Project> = {}): Project {
  return {
    projectId: "LEG-1",
    projectName: "Legacy project",
    status: "active",
    stage: "В работе",
    startDate: "2025-10-01",
    endDate: "2026-12-31",
    deadlineAt: "2026-12-31",
    goals: ["Preserve evaluation inputs"],
    resultImages: ["Expected result"],
    projectManager: "Manager",
    projectAdmin: "Administrator",
    sponsor: "Sponsor",
    projectTeam: "Team",
    responsible: "Responsible",
    projectOwner: "Owner",
    department: "Engineering",
    priority: 1,
    monitoringStart: "2025-10-01",
    monitoringFrequencyWeeks: 4,
    lastPcDate: "2026-01-15",
    tasks: [],
    milestones: [],
    indicators: [],
    _rawByYear: {
      2025: {
        milestones: {
          q4names: "Foundation",
          q4progress: "100%",
          q4weights: "40%"
        },
        indicators: {
          q4names: "Revenue",
          q4plans: "100",
          q4facts: "110"
        }
      },
      2026: {
        milestones: {
          q1names: "Build; Launch",
          q1progress: "25%; 75%",
          q1weights: "20%; 40%"
        },
        indicators: {
          q1names: "Adoption; Conversion",
          q1plans: "200; 50",
          q1facts: "150; 45"
        }
      }
    } as any,
    ...overrides
  };
}

function milestoneSnapshot(project: NormalizedProject) {
  return project.milestones.map(milestone => ({
    year: milestone.year,
    quarter: milestone.quarter,
    name: milestone.name,
    progressPercent: milestone.progressPercent,
    weightPercent: milestone.weightPercent
  }));
}

function indicatorSnapshot(project: NormalizedProject) {
  return project.indicators.map(indicator => ({
    year: indicator.year,
    quarter: indicator.quarter,
    name: indicator.name,
    plan: indicator.plan,
    fact: indicator.fact
  }));
}

const assessmentDate = new Date("2026-02-15T12:00:00Z");

runTest("multi-year cache data is reconstructed without dropping evaluation inputs", () => {
  const projects = reconstructNormalizedProjectsFromLegacy(
    [
      projectFixture(),
      projectFixture({
        projectId: "LEG-2",
        projectName: "Second legacy project",
        _rawByYear: {
          2026: {
            milestones: { q2names: "Second milestone", q2progress: "10%", q2weights: "100%" },
            indicators: { q2names: "Second indicator", q2plans: "10", q2facts: "2" }
          }
        } as any
      })
    ],
    assessmentDate
  );

  assert(projects.length === 2, "both legacy projects must be reconstructed");
  assert(projects[0].projectId === "LEG-1", "project order and first ID must be preserved");
  assert(projects[1].projectId === "LEG-2", "project order and second ID must be preserved");
  assert(
    JSON.stringify(projects[0].source.detectedYears) === JSON.stringify([2025, 2026]),
    `detected years must retain both source years, got ${projects[0].source.detectedYears.join(", ")}`
  );

  const milestones = milestoneSnapshot(projects[0]);
  assert(milestones.length === 3, `expected 3 milestones across two years, got ${milestones.length}`);
  assert(
    milestones.some(
      milestone =>
        milestone.year === 2025 &&
        milestone.quarter === "Q4" &&
        milestone.name === "Foundation" &&
        milestone.progressPercent === 100 &&
        milestone.weightPercent === 40
    ),
    "2025 Q4 milestone values must survive reconstruction"
  );
  assert(
    milestones.some(
      milestone =>
        milestone.year === 2026 &&
        milestone.quarter === "Q1" &&
        milestone.name === "Launch" &&
        milestone.progressPercent === 75 &&
        milestone.weightPercent === 40
    ),
    "positionally aligned 2026 milestone values must survive reconstruction"
  );

  const indicators = indicatorSnapshot(projects[0]);
  assert(indicators.length === 3, `expected 3 indicators across two years, got ${indicators.length}`);
  assert(
    indicators.some(
      indicator =>
        indicator.year === 2026 &&
        indicator.quarter === "Q1" &&
        indicator.name === "Conversion" &&
        indicator.plan === 50 &&
        indicator.fact === 45
    ),
    "positionally aligned indicator plan and fact must survive reconstruction"
  );
});

runTest("normalized-to-legacy round trip preserves milestone and indicator facts", () => {
  const normalized = reconstructNormalizedProjectsFromLegacy([projectFixture()], assessmentDate)[0];
  const legacyRoundTrip = toLegacyProjectView(normalized);
  const reconstructed = reconstructNormalizedProjectsFromLegacy([legacyRoundTrip], assessmentDate)[0];

  assert(reconstructed.projectId === normalized.projectId, "round trip must preserve project ID");
  assert(
    JSON.stringify(milestoneSnapshot(reconstructed)) === JSON.stringify(milestoneSnapshot(normalized)),
    "round trip must preserve milestone year, quarter, progress, and weight"
  );
  assert(
    JSON.stringify(indicatorSnapshot(reconstructed)) === JSON.stringify(indicatorSnapshot(normalized)),
    "round trip must preserve indicator year, quarter, plan, and fact"
  );
});

console.log("-----------------------------------------------------------");
console.log("All legacy reconstruction tests passed successfully!");
console.log("-----------------------------------------------------------");
