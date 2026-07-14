import { buildProjectEvaluationSignature } from "../server/services/googleSheetsService";
import { getProblematicSignificantFields, buildProjectAnalysisPayload } from "../server/services/projectAnalysisPayloadService";
import { Project } from "../src/types";

console.log("=== RUNNING NEW FUNCTIONALITY TEST SUITE (CHECKPOINT 2/3) ===");

let failed = false;
function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    failed = true;
  } else {
    console.log(`✅ PASS: ${message}`);
  }
}

// 1. Test Cache Signature Invalidation
{
  const p1: Project = {
    projectId: "P-1",
    projectName: "Project Alpha",
    goals: "Goal 1",
    resultImages: "Image 1",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    stage: "В работе",
    projectType: "Type A",
    projectManager: "Manager A",
    projectAdmin: "Admin A",
    sponsor: "Sponsor A",
    projectTeam: "Team A",
    priority: 1,
    responsible: "Responsible A",
    monitoringStart: "2026-02-01",
    monitoringFrequencyWeeks: 2,
    lastPcDate: "2026-02-15",
    observers: ["Observer A"],
    projectOwner: "Owner A",
    department: "Department A",
    milestones: [],
    indicators: [],
    tasks: []
  } as any;

  const sig1 = buildProjectEvaluationSignature([p1]);

  // If we change projectName, signature must change
  const p2 = { ...p1, projectName: "Project Beta" } as any;
  const sig2 = buildProjectEvaluationSignature([p2]);
  assert(sig1 !== sig2, "Cache Signature: Modifying projectName changes signature");

  // If we change goals, signature must change
  const p3 = { ...p1, goals: "New Goals" } as any;
  const sig3 = buildProjectEvaluationSignature([p3]);
  assert(sig1 !== sig3, "Cache Signature: Modifying goals changes signature");

  // If we change resultImages, signature must change
  const p4 = { ...p1, resultImages: "New Images" } as any;
  const sig4 = buildProjectEvaluationSignature([p4]);
  assert(sig1 !== sig4, "Cache Signature: Modifying resultImages changes signature");

  // If we change department, signature must change
  const p5 = { ...p1, department: "Department B" } as any;
  const sig5 = buildProjectEvaluationSignature([p5]);
  assert(sig1 !== sig5, "Cache Signature: Modifying department changes signature");

  // If we change projectOwner, signature must change
  const p6 = { ...p1, projectOwner: "Owner B" } as any;
  const sig6 = buildProjectEvaluationSignature([p6]);
  assert(sig1 !== sig6, "Cache Signature: Modifying projectOwner changes signature");

  // If we change monitoringStart, signature must change
  const p7 = { ...p1, monitoringStart: "2026-03-01" } as any;
  const sig7 = buildProjectEvaluationSignature([p7]);
  assert(sig1 !== sig7, "Cache Signature: Modifying monitoringStart changes signature");

  // If we change lastPcDate, signature must change
  const p8 = { ...p1, lastPcDate: "2026-03-15" } as any;
  const sig8 = buildProjectEvaluationSignature([p8]);
  assert(sig1 !== sig8, "Cache Signature: Modifying lastPcDate changes signature");

  // If we change a field NOT affecting completeness or evaluation (like projectDescription), signature should NOT change
  const p9 = { ...p1, projectDescription: "Some random description that is not used in completeness" } as any;
  const sig9 = buildProjectEvaluationSignature([p9]);
  assert(sig1 === sig9, "Cache Signature: Modifying non-completeness field projectDescription does NOT change signature");
}

// 2. Test AI Payload Service invalidFields structure & contents
{
  const project: Project = {
    projectId: "P-1",
    projectName: "Test Project",
    goals: "Goals",
    resultImages: "Images",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    stage: "В работе",
    projectType: "Type A",
    projectManager: "Manager A",
    projectAdmin: "Admin A",
    sponsor: "Sponsor A",
    projectTeam: "Team A",
    priority: 1,
    responsible: "Responsible A",
    monitoringStart: "2027-01-01", // Invalid because after endDate
    monitoringFrequencyWeeks: 2,
    lastPcDate: "",
    observers: ["Observer A"],
    projectOwner: "Owner A",
    department: "Department A",
    milestones: [],
    indicators: [],
    tasks: []
  } as any;

  // Let's call getProblematicSignificantFields
  const { missingFields, invalidFields } = getProblematicSignificantFields(project, "2026-06-01");
  
  assert(invalidFields.length > 0, "AI Payload: Should find invalid fields");
  assert(invalidFields.some(f => f.field === "Дата начала мониторинга"), "AI Payload: 'Дата начала мониторинга' is marked invalid");
  assert(invalidFields.some(f => f.reason.includes("позже даты завершения")), "AI Payload: correct reason for invalid monitoringStart");

  // Let's call buildProjectAnalysisPayload
  const payload = buildProjectAnalysisPayload({
    project,
    evaluation: null,
    assessmentDate: "2026-06-01",
    assessmentDateMode: "custom"
  });

  assert(payload.dataQualitySnapshot !== undefined, "AI Payload: contains dataQualitySnapshot");
  assert(payload.dataQualitySnapshot.invalidFields !== undefined, "AI Payload: contains invalidFields list in snapshot");
  assert(payload.dataQualitySnapshot.invalidFields.some((f: any) => f.field === "Дата начала мониторинга"), "AI Payload: snapshot includes invalid monitoring start");
}

if (failed) {
  process.exit(1);
} else {
  console.log("\n⭐️ ALL NEW FUNCTIONALITY TESTS PASSED SUCCESSFULLY! ⭐️\n");
}
