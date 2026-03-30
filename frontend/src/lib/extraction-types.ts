export type ExtractedAssessment = {
  id?: string;
  name: string;
  weight: number;
  is_bonus?: boolean;
  rule?: string | null;
  rule_type?: string | null;
  rule_config?: Record<string, unknown> | null;
  total_count?: number | null;
  effective_count?: number | null;
  children?: ExtractedAssessment[];
};

export type ExtractedDeadline = {
  title: string;
  due_date?: string | null;
  due_time?: string | null;
  deadline_type?: string | null;
  assessment_name?: string | null;
  source?: string | null;
  notes?: string | null;
};

export type ExtractionDiagnostics = {
  confidence_score: number;
  confidence_level: string;
  trigger_gpt: boolean;
  trigger_reasons: string[];
  parse_warnings?: string[];
  failure_reason?: string | null;
};

export type ExtractionResult = {
  course_code?: string | null;
  structure_valid: boolean;
  assessments: ExtractedAssessment[];
  deadlines: ExtractedDeadline[];
  diagnostics: ExtractionDiagnostics;
};

export type InstitutionalGradeBoundary = {
  letter: string;
  minLabel: string;
  points: string;
  descriptor: string;
};

export type InstitutionalGradingRules = {
  institution: string;
  scale: string;
  grade_boundaries: InstitutionalGradeBoundary[];
  boundary_handling?: "round-up" | "strict";
  rounding?: "one-decimal" | "none";
};

export type ConfirmedExtractionResult = ExtractionResult & {
  course_name?: string;
  term?: string | null;
  institutional_grading_rules?: InstitutionalGradingRules;
};
