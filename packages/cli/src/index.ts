export { canonicalJson, sha256 } from "./canonical.js";
export { parseNextJsHostFixture } from "./fixture.js";
export {
  executeCommand,
  parseArguments,
  usage,
  type FixtureArguments,
  type ParsedArguments,
  type RootArguments,
} from "./main.js";
export {
  buildLivingConfig,
  buildProductManifest,
  planCommand,
  planDoctor,
  planInit,
  planMap,
  planUninstall,
  summarizePlan,
} from "./planners.js";
export {
  REQUIRED_PRESERVED_PATHS,
  ROOT_RESULT_SCHEMA_VERSION,
  RootModeError,
  loadAutomaticEvolutionInput,
  runRootCommand,
  validateRuntimeBindings,
  type AutomaticEvolutionInput,
  type RootCommandOptions,
} from "./root-mode.js";
export {
  SOURCE_CANDIDATE_LIMITS,
  SourceCandidateError,
  collectSourceCandidates,
  type CollectSourceCandidatesInput,
  type SourceCandidate,
  type SourceCandidateBrief,
  type SourceCandidateErrorCode,
} from "./source-candidates.js";
export {
  formatTerminalResult,
  runTerminalCommand,
  type ApplyArguments,
  type ApproveArguments,
  type ImproveArguments,
  type InstallArguments,
  type RollbackArguments,
  type StatusArguments,
  type TerminalArguments,
  type TerminalDependencies,
  type TerminalProvider,
  type TerminalResult,
} from "./terminal.js";
export {
  CLI_PLAN_SCHEMA_VERSION,
  NEXT_HOST_FIXTURE_SCHEMA_VERSION,
  type AutomaticCliCommand,
  type CliCommand,
  type CliPlan,
  type Diagnostic,
  type DoctorInputs,
  type FixtureEdge,
  type FixtureEventDeclaration,
  type FixtureNode,
  type NextJsHostFixture,
  type PlannedChange,
  type TerminalCliCommand,
} from "./types.js";
