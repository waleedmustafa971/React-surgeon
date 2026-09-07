export interface SourceLocation {
  file: string;
  line: number;
  column: number;
}
export interface SelectedElement extends SourceLocation {
  role?: string;
  name?: string;
  text: string;
  route: string;
  testId?: string;
}
export interface ReactHook {
  name: string;
  line: number;
}
export interface ReactComponent extends SourceLocation {
  name: string;
  props: string[];
  imports: string[];
  exports: string[];
  hooks: ReactHook[];
  children: string[];
  parents: string[];
  state: string[];
  events: string[];
}
export interface ProjectInfo {
  root: string;
  react: string;
  reactDOM?: string;
  language: string;
  packageManager: string;
  scripts: Record<string, string>;
  dependencies: Record<string, string>;
  features: string[];
  entries: string[];
  sourceDirectory: string;
}
export interface ProjectGraph {
  components: ReactComponent[];
  imports: Record<string, string[]>;
  routes: string[];
  diagnostics: { file: string; line: number; message: string }[];
}
export interface ModelRequest {
  system: string;
  prompt: string;
  maxTokens?: number;
}
export interface ModelResponse {
  text: string;
  tokens?: number;
}
export interface ModelProvider {
  start(): Promise<void>;
  stop(): Promise<void>;
  isRunning(): Promise<boolean>;
  generate(request: ModelRequest): Promise<ModelResponse>;
}
export interface ToolResult {
  ok: boolean;
  data?: unknown;
  error?: string;
}
export type AgentAction =
  | { type: "tool"; tool: string; arguments: Record<string, unknown> }
  | { type: "patch"; path: string; oldText: string; newText: string }
  | { type: "complete"; summary: string };
export type ScenarioStep =
  | { action: "navigate"; url: string }
  | { action: "reload" }
  | {
      action: "click" | "fill" | "assertText" | "assertVisible" | "submit";
      role?: string;
      name?: string;
      testId?: string;
      selector?: string;
      value?: string;
    }
  | { action: "assertURL"; value: string };
export interface Scenario {
  name: string;
  baseURL: string;
  steps: ScenarioStep[];
}
export interface CheckResult {
  name: string;
  status: "passed" | "failed" | "skipped";
  durationMs: number;
  output: string;
}
export interface RuntimeResult {
  source?: SelectedElement;
  status: "passed" | "failed" | "skipped";
  url: string;
  consoleErrors: string[];
  pageErrors: string[];
  failedRequests: string[];
  assertions: number;
  state: string;
  error?: string;
}
export interface VerificationResult {
  static: CheckResult[];
  runtime: RuntimeResult;
  verified: boolean;
}
export interface FileChange {
  path: string;
  diff: string;
  added: number;
  removed: number;
}
export interface Proof {
  id: string;
  createdAt: string;
  task: string;
  acceptanceCriteria: string[];
  changes: FileChange[];
  verification: VerificationResult;
  scenario: Scenario;
  status: "VERIFIED" | "BLOCKED";
  baseline?: RuntimeResult;
}
