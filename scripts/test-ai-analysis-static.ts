import fs from "fs-extra";
import path from "path";

function runTest(name: string, fn: () => void) {
  console.log(`[AI_ANALYSIS_STATIC_TEST] Running: ${name}...`);
  try {
    fn();
    console.log(`[AI_ANALYSIS_STATIC_TEST] ✓ Passed\n`);
  } catch (error: any) {
    console.error(`[AI_ANALYSIS_STATIC_TEST] ❌ FAILED: ${name}`);
    console.error(error);
    process.exit(1);
  }
}

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

// --- Run Tests ---

runTest("Verify AnalysisPanel is completely static and motion-free", () => {
  const filePath = path.join(process.cwd(), "src", "components", "AnalysisPanel.tsx");
  assert(fs.existsSync(filePath), "AnalysisPanel.tsx must exist");
  
  const content = fs.readFileSync(filePath, "utf8");
  
  // Rule 1: No motion imports
  assert(!content.includes("motion/react"), "AnalysisPanel should not import from 'motion/react'");
  assert(!content.includes('import { motion }'), "AnalysisPanel should not import 'motion'");
  
  // Rule 2: No motion JSX elements
  assert(!content.includes("<motion.div"), "AnalysisPanel should not contain <motion.div>");
  assert(!content.includes("variants="), "AnalysisPanel should not contain motion variants prop");
  assert(!content.includes("initial="), "AnalysisPanel should not contain motion initial prop");
  assert(!content.includes("animate="), "AnalysisPanel should not contain motion animate prop");
  
  // Rule 3: Text elements should render statically with normal HTML tags
  assert(content.includes("<div className=\"space-y-8 font-sans\">"), "AnalysisPanel must contain standard div for root layout");
  assert(content.includes("summary &&"), "AnalysisPanel should render summary section statically");
  assert(content.includes("keyProblems &&"), "AnalysisPanel should render keyProblems section statically");
  assert(content.includes("priorityActions &&"), "AnalysisPanel should render priorityActions section statically");
  assert(content.includes("directionAnalysis &&"), "AnalysisPanel should render directionAnalysis section statically");
  assert(content.includes("aiProposal &&"), "AnalysisPanel should render aiProposal section statically");
});

runTest("Verify ai-analysis-full container in ProjectCard is free of animate-soft-enter", () => {
  const filePath = path.join(process.cwd(), "src", "components", "ProjectCard.tsx");
  assert(fs.existsSync(filePath), "ProjectCard.tsx must exist");
  
  const content = fs.readFileSync(filePath, "utf8");
  
  // Find where id="ai-analysis-full" is defined
  const targetLine = "id=\"ai-analysis-full\"";
  assert(content.includes(targetLine), "ProjectCard must contain ai-analysis-full element");
  
  // Check that the container div does NOT have animate-soft-enter
  // In the file it was: <div id="ai-analysis-full" className="pt-8 animate-soft-enter">
  // We replaced it with: <div id="ai-analysis-full" className="pt-8">
  assert(!content.includes('id="ai-analysis-full" className="pt-8 animate-soft-enter"'), "ai-analysis-full should not have animate-soft-enter class");
  assert(content.includes('id="ai-analysis-full" className="pt-8"'), "ai-analysis-full container should use static pt-8 class");
});

runTest("Verify cross-site form posts cannot trigger AI analysis", () => {
  const filePath = path.join(process.cwd(), "server.ts");
  const content = fs.readFileSync(filePath, "utf8");
  const routeStart = content.indexOf('app.post("/api/projects/:projectId/analyze"');
  const routeEnd = content.indexOf("// 18. GET /api/sync-logs", routeStart);

  assert(routeStart !== -1 && routeEnd !== -1, "AI analysis route must exist");

  const route = content.slice(routeStart, routeEnd);
  const jsonGuard = route.indexOf('if (!req.is("application/json"))');
  const projectLookup = route.indexOf("storage.getProjectById");

  assert(jsonGuard !== -1, "AI analysis route must require application/json");
  assert(route.includes("res.status(415)"), "Non-JSON analysis requests must return HTTP 415");
  assert(jsonGuard < projectLookup, "JSON content-type guard must run before project lookup and AI work");
});

console.log("-----------------------------------------------------------");
console.log("All AI static-analysis verification test cases passed successfully!");
console.log("-----------------------------------------------------------");
