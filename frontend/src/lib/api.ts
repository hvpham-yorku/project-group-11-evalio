function getDefaultApiBaseUrl(): string {
  if (typeof window !== "undefined") {
    const hostname = window.location.hostname;

    if (hostname === "127.0.0.1") {
      return "http://127.0.0.1:8000";
    }

    if (hostname === "localhost") {
      return "http://localhost:8000";
    }
  }

  return "http://127.0.0.1:8000";
}

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL?.trim() || getDefaultApiBaseUrl();

export type CourseAssessment = {
  name: string;
  weight: number;
  raw_score?: number | null;
  total_score?: number | null;
  children?: CourseAssessment[] | null;
  rule_type?: string | null;
  rule_config?: Record<string, unknown> | null;
  total_count?: number | null;
  effective_count?: number | null;
  unit_weight?: number | null;
  is_bonus?: boolean;
};

export type Course = {
  course_id: string;
  name: string;
  course_name?: string;
  term?: string | null;
  bonus_policy?: "none" | "additive" | "capped";
  bonus_cap_percentage?: number | null;
  assessments: CourseAssessment[];
};

export type CreateCourseResponse = {
  message: string;
  total_weight: number;
  course_id: string;
  course: Omit<Course, "course_id">;
};

export type YorkEquivalent = {
  letter: string;
  grade_point: number;
  description: string;
};

export type TargetCheckResponse = {
  target: number;
  current_standing: number;
  final_total?: number;
  maximum_possible: number;
  feasible: boolean;
  explanation: string;
  york_equivalent: YorkEquivalent;
  required_points: number;
  required_average: number;
  required_average_display: string;
  required_fraction_display: string;
  classification: string;
};

export type UpdateCourseGradesResponse = {
  message: string;
  course_id: string;
  course_index?: number;
  current_standing: number;
  final_total?: number;
  assessments: Array<{
    name: string;
    weight: number;
    raw_score: number | null;
    total_score: number | null;
  }>;
};

export type UpdateCourseMetadataResponse = {
  message: string;
  course_id: string;
  course: Omit<Course, "course_id">;
};

export type WhatIfResponse = {
  course_name: string;
  assessment_name: string;
  assessment_weight: number;
  hypothetical_score: number;
  hypothetical_contribution: number;
  current_standing: number;
  projected_grade: number;
  remaining_potential: number;
  maximum_possible: number;
  york_equivalent: YorkEquivalent;
  explanation: string;
  mandatory_pass_status?: MandatoryPassStatus;
};

export type MinimumRequiredResponse = {
  course_name: string;
  assessment_name: string;
  assessment_weight: number;
  minimum_required: number;
  is_achievable: boolean;
  current_standing: number;
  other_remaining_assumed_max: number;
  target: number;
  explanation: string;
  mandatory_pass_warning?: string;
};

export type UniformRequiredChild = {
  name: string;
  weight: number;
  graded: boolean;
  uniform_percent: number;
  contribution: number;
};

export type UniformRequiredAssessment = {
  name: string;
  weight: number;
  is_bonus: boolean;
  graded: boolean;
  current_contribution: number;
  projected_contribution: number;
  uniform_percent: number;
  is_mandatory_pass: boolean;
  pass_threshold: number | null;
  pass_status: "passed" | "failed" | "pending" | null;
  has_children: boolean;
  children: UniformRequiredChild[] | null;
};

export type UniformRequiredResponse = {
  target: number;
  current_standing: number;
  uniform_required: number;
  projected_total: number;
  max_possible: number | null;
  is_achievable: boolean;
  classification: string;
  assessments: UniformRequiredAssessment[];
};

export type MandatoryPassRequirement = {
  assessment_name: string;
  threshold: number;
  status: "passed" | "failed" | "pending";
  actual_percent?: number;
};

export type MandatoryPassStatus = {
  has_requirements: boolean;
  requirements_met: boolean;
  failed_assessments: string[];
  pending_assessments: string[];
  requirements: MandatoryPassRequirement[];
};

export type GpaConversion = {
  letter: string;
  grade_point: number;
  description: string;
  scale: string;
  percentage: number;
};

export type CourseGpaResponse = {
  course_id: string;
  course_name: string;
  percentage: number;
  is_failed?: boolean;
  totals: Record<string, unknown>;
  gpa: GpaConversion;
  all_scales: Record<string, GpaConversion>;
};

export type CgpaCoursePayload = {
  name: string;
  percentage: number | null;
  credits: number;
  grade_type?: "numeric" | "pass_fail" | "withdrawn";
};

export type CgpaResponse = {
  scale: string;
  cgpa: number;
  total_credits: number;
  total_weighted_points: number;
  courses: Array<{
    name: string;
    credits: number;
    percentage: number;
    letter: string;
    grade_point: number;
    description: string;
    scale: string;
    weighted_contribution: number;
  }>;
  excluded: Array<{
    name: string;
    credits: number;
    grade_type: string;
    reason: string;
  }>;
  formula: string;
};

export type GpaScaleConversionResponse = {
  current_gpa: number;
  from_scale: number;
  to_scale: number;
  converted_gpa: number;
  normalized_percent: number;
  formula: string;
  method: string;
};

export type LearningStrategyTechnique = {
  name: string;
  description: string;
  best_for: string[];
  reason: string;
  priority: string;
};

export type LearningStrategySuggestion = {
  assessment_name: string;
  assessment_type: string;
  weight: number;
  days_until_due?: number | null;
  due_date?: string | null;
  target_grade?: number | null;
  current_grade?: number | null;
  target_gap?: number | null;
  weakest_area?: {
    name: string;
    percent: number;
    type: string;
    weight: number;
  } | null;
  techniques: LearningStrategyTechnique[];
};

export type LearningStrategiesResponse = {
  course_name: string;
  suggestions: LearningStrategySuggestion[];
};

export type DashboardBreakdownEntry = {
  name: string;
  weight: number;
  is_bonus: boolean;
  graded: boolean;
  current_contribution: number;
  max_contribution: number;
  remaining_potential: number;
  score_percent?: number;
  is_mandatory_pass?: boolean;
  pass_threshold?: number | null;
  pass_status?: "passed" | "failed" | "pending" | null;
};

export type DashboardSummaryResponse = {
  course_name: string;
  min_grade: number;
  max_grade: number;
  current_grade: number;
  min_normalised: number;
  max_normalised: number;
  current_normalised: number;
  normalisation_applied: boolean;
  core_weight: number;
  bonus_weight: number;
  core_grade?: number;
  bonus_contribution?: number;
  graded_weight: number;
  remaining_weight: number;
  breakdown: DashboardBreakdownEntry[];
  mandatory_pass_status?: MandatoryPassStatus;
  gpa_current: Record<string, GpaConversion>;
  gpa_best_case: Record<string, GpaConversion>;
  york_equivalent: YorkEquivalent;
};

export type DashboardWhatIfBreakdownEntry = {
  name: string;
  weight: number;
  is_bonus: boolean;
  source: string;
  contribution: number;
  max_contribution: number;
  hypothetical_score?: number;
  is_mandatory_pass?: boolean;
  pass_threshold?: number | null;
  pass_status?: "passed" | "failed" | "pending" | null;
};

export type DashboardWhatIfResponse = {
  course_name: string;
  projected_grade: number;
  maximum_possible: number;
  current_grade: number;
  projected_normalised?: number;
  maximum_possible_normalised?: number;
  current_normalised?: number;
  normalisation_applied?: boolean;
  core_weight?: number;
  bonus_weight?: number;
  current_core_grade?: number;
  current_bonus_contribution?: number;
  projected_core_grade?: number;
  projected_bonus_contribution?: number;
  maximum_core_grade?: number;
  maximum_bonus_contribution?: number;
  scenarios_applied: number;
  mandatory_pass_status?: MandatoryPassStatus;
  mandatory_pass_warnings?: string[];
  york_equivalent_projected: YorkEquivalent;
  gpa_projected: Record<string, GpaConversion>;
  breakdown: DashboardWhatIfBreakdownEntry[];
};

export type SaveScenarioPayload = {
  name: string;
  scenarios: Array<{
    assessment_name: string;
    score: number;
  }>;
};

export type SaveScenarioResponse = {
  message: string;
  scenario: {
    scenario_id: string;
    name: string;
    created_at: string;
    entries: Array<{
      assessment_name: string;
      score: number;
    }>;
    entry_count: number;
  };
};

export type SavedScenario = {
  scenario_id: string;
  name: string;
  created_at: string;
  entries: Array<{
    assessment_name: string;
    score: number;
  }>;
  entry_count: number;
};

export type ListScenariosResponse = {
  scenarios: SavedScenario[];
  count: number;
};

export type RunSavedScenarioResponse = {
  scenario: SavedScenario;
  result: unknown;
};

export type ApiError = Error & {
  response?: {
    data?: unknown;
  };
};

export type UserProfile = {
  user_id: string;
  email: string;
};

function getDetail(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const detail = (body as { detail?: unknown }).detail;
  return typeof detail === "string" && detail.trim() ? detail : null;
}

type RequestOptions = RequestInit & {
  skipAuthRedirect?: boolean;
};

async function request(path: string, options?: RequestOptions) {
  const { skipAuthRedirect = false, ...requestOptions } = options ?? {};
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...requestOptions,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(requestOptions.headers ?? {}),
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => undefined);
    if (
      response.status === 401 &&
      !skipAuthRedirect &&
      !path.startsWith("/auth/") &&
      typeof window !== "undefined" &&
      !window.location.pathname.startsWith("/login")
    ) {
      const next = encodeURIComponent(window.location.pathname);
      window.location.assign(`/login?next=${next}`);
    }
    const message = getDetail(body) ?? `Request failed: ${response.status}`;
    const error = new Error(message) as ApiError;
    error.response = { data: body };
    throw error;
  }

  const text = await response.text();
  if (!text) return null;
  return JSON.parse(text);
}

export function register(payload: { email: string; password: string }) {
  return request("/auth/register", {
    method: "POST",
    body: JSON.stringify(payload),
    skipAuthRedirect: true,
  }) as Promise<{ message: string; user: UserProfile }>;
}

export function login(payload: { email: string; password: string }) {
  return request("/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
    skipAuthRedirect: true,
  }) as Promise<{ message: string }>;
}

export function logout() {
  return request("/auth/logout", {
    method: "POST",
    skipAuthRedirect: true,
  }) as Promise<{ message: string }>;
}

export function getMe() {
  return request("/auth/me", {
    skipAuthRedirect: true,
  }) as Promise<UserProfile>;
}

export function listCourses() {
  return request("/courses/") as Promise<Course[]>;
}

export function createCourse(payload: {
  name: string;
  term?: string | null;
  bonus_policy?: "none" | "additive" | "capped";
  bonus_cap_percentage?: number | null;
  assessments: Array<{
    name: string;
    weight: number;
    raw_score?: number | null;
    total_score?: number | null;
    children?: Array<{
      name: string;
      weight: number;
      raw_score?: number | null;
      total_score?: number | null;
    }> | null;
    rule_type?: string | null;
    rule_config?: Record<string, unknown> | null;
    is_bonus?: boolean;
  }>;
}) {
  return request("/courses/", {
    method: "POST",
    body: JSON.stringify(payload),
  }) as Promise<CreateCourseResponse>;
}

export function confirmExtraction(payload: {
  course_name: string;
  term?: string | null;
  extraction_result: any;
}) {
  return request("/extraction/confirm", {
    method: "POST",
    body: JSON.stringify(payload),
  }) as Promise<CreateCourseResponse>;
}

export function updateCourseWeights(
  courseId: string,
  payload: { assessments: Array<{ name: string; weight: number }> }
) {
  return request(`/courses/${courseId}/weights`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function updateCourseGrades(
  courseId: string,
  payload: {
    assessments: Array<{
      name: string;
      raw_score: number | null;
      total_score: number | null;
      children?: Array<{
        name: string;
        raw_score: number | null;
        total_score: number | null;
      }>;
    }>;
  }
) {
  return request(`/courses/${courseId}/grades`, {
    method: "PUT",
    body: JSON.stringify(payload),
  }) as Promise<UpdateCourseGradesResponse>;
}

export function updateCourseMetadata(
  courseId: string,
  payload: { name: string; term?: string | null }
) {
  return request(`/courses/${courseId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  }) as Promise<UpdateCourseMetadataResponse>;
}

export function deleteCourse(courseId: string) {
  return request(`/courses/${courseId}`, {
    method: "DELETE",
  }) as Promise<{ message: string; course_id: string }>;
}

export function checkTarget(courseId: string, payload: { target: number }) {
  return request(`/courses/${courseId}/target`, {
    method: "POST",
    body: JSON.stringify(payload),
  }) as Promise<TargetCheckResponse>;
}

export function runWhatIf(
  courseId: string,
  payload: { assessment_name: string; hypothetical_score: number }
) {
  return request(`/courses/${courseId}/whatif`, {
    method: "POST",
    body: JSON.stringify(payload),
  }) as Promise<WhatIfResponse>;
}

export function saveScenario(courseId: string, payload: SaveScenarioPayload) {
  return request(`/courses/${courseId}/scenarios`, {
    method: "POST",
    body: JSON.stringify(payload),
  }) as Promise<SaveScenarioResponse>;
}

export function listSavedScenarios(courseId: string) {
  return request(`/courses/${courseId}/scenarios`) as Promise<ListScenariosResponse>;
}

export function runSavedScenario(courseId: string, scenarioId: string) {
  return request(
    `/courses/${courseId}/scenarios/${scenarioId}/run`
  ) as Promise<RunSavedScenarioResponse>;
}

export function deleteSavedScenario(courseId: string, scenarioId: string) {
  return request(`/courses/${courseId}/scenarios/${scenarioId}`, {
    method: "DELETE",
  }) as Promise<{ message: string }>;
}

export function getMinimumRequired(
  courseId: string,
  payload: { target: number; assessment_name: string }
) {
  return request(`/courses/${courseId}/minimum-required`, {
    method: "POST",
    body: JSON.stringify(payload),
  }) as Promise<MinimumRequiredResponse>;
}

export function getCourseGpa(courseId: string, scale = "4.0") {
  return request(
    `/courses/${courseId}/gpa?scale=${encodeURIComponent(scale)}`
  ) as Promise<CourseGpaResponse>;
}

export function computeCgpa(payload: {
  courses: CgpaCoursePayload[];
  scale: string;
}) {
  return request("/gpa/cgpa", {
    method: "POST",
    body: JSON.stringify(payload),
  }) as Promise<CgpaResponse>;
}

export function convertGpaScale(payload: {
  current_gpa: number;
  from_scale: number;
  to_scale: number;
}) {
  return request("/gpa/convert", {
    method: "POST",
    body: JSON.stringify(payload),
  }) as Promise<GpaScaleConversionResponse>;
}

export function getLearningStrategies(courseId: string) {
  return request(
    `/courses/${courseId}/dashboard/strategies`
  ) as Promise<LearningStrategiesResponse>;
}

export function getDashboardSummary(courseId: string) {
  return request(`/courses/${courseId}/dashboard`) as Promise<DashboardSummaryResponse>;
}

export function getUniformRequired(
  courseId: string,
  payload: { target: number }
) {
  return request(`/courses/${courseId}/dashboard/uniform-required`, {
    method: "POST",
    body: JSON.stringify(payload),
  }) as Promise<UniformRequiredResponse>;
}

export function runDashboardWhatIf(
  courseId: string,
  payload: { scenarios: Array<{ assessment_name: string; score: number }> }
) {
  return request(`/courses/${courseId}/dashboard/whatif`, {
    method: "POST",
    body: JSON.stringify(payload),
  }) as Promise<DashboardWhatIfResponse>;
}

// ─── Deadline & Google Calendar Types ─────────────────────────────────────────

export type Deadline = {
  deadline_id: string;
  course_id: string;
  title: string;
  deadline_type?: string | null;
  due_date: string;
  due_time?: string | null;
  notes?: string | null;
  source: string;
  assessment_name?: string | null;
  exported_to_gcal: boolean;
  gcal_event_id?: string | null;
  created_at: string;
};

export type DeadlineListResponse = {
  deadlines: Deadline[];
  count: number;
};

export type GoogleAuthUrlResponse = {
  authorization_url: string;
  state: string;
};

export type GoogleCalendarStatusResponse = {
  connected: boolean;
};

export type DeadlineExportResponse = {
  exported_count: number;
  skipped_duplicates: number;
  events: Array<{ deadline_id: string; gcal_event_id?: string; status?: string }>;
};

// ─── Deadline & Google Calendar API Functions ─────────────────────────────────

export function listDeadlines(courseId: string) {
  return request(`/courses/${courseId}/deadlines`) as Promise<DeadlineListResponse>;
}

export function createDeadline(
  courseId: string,
  payload: {
    title: string;
    deadline_type?: string | null;
    due_date: string;
    due_time?: string | null;
    notes?: string | null;
    assessment_name?: string | null;
  }
) {
  return request(`/courses/${courseId}/deadlines`, {
    method: "POST",
    body: JSON.stringify(payload),
  }) as Promise<{ message: string; deadline: Deadline }>;
}

export function updateDeadline(
  courseId: string,
  deadlineId: string,
  payload: {
    title?: string;
    deadline_type?: string | null;
    due_date?: string;
    due_time?: string | null;
    notes?: string | null;
    assessment_name?: string | null;
  }
) {
  return request(`/courses/${courseId}/deadlines/${deadlineId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  }) as Promise<{ message: string; deadline: Deadline }>;
}

export function deleteDeadline(courseId: string, deadlineId: string) {
  return request(`/courses/${courseId}/deadlines/${deadlineId}`, {
    method: "DELETE",
  }) as Promise<{ message: string }>;
}

export function getGoogleAuthUrl() {
  return request("/deadlines/google/authorize") as Promise<GoogleAuthUrlResponse>;
}

export function getGoogleCalendarStatus() {
  return request("/deadlines/google/status") as Promise<GoogleCalendarStatusResponse>;
}

export function exchangeGoogleCode(code: string, state: string) {
  return request(`/deadlines/google/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`) as Promise<{ message: string }>;
}

export function exportToGoogleCalendar(
  courseId: string,
  payload?: {
    deadlineIds?: string[];
    minGradeInfo?: Record<string, { minimum_required: number }>;
  }
) {
  return request(`/courses/${courseId}/deadlines/export/gcal`, {
    method: "POST",
    body: JSON.stringify({
      deadline_ids: payload?.deadlineIds ?? null,
      min_grade_info: payload?.minGradeInfo ?? null,
    }),
  }) as Promise<DeadlineExportResponse>;
}

export function exportToIcs(
  courseId: string,
  payload?: {
    deadlineIds?: string[];
    minGradeInfo?: Record<string, { minimum_required: number }>;
  }
) {
  // ICS returns a file, handle differently
  return fetch(`${API_BASE_URL}/courses/${courseId}/deadlines/export/ics`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      deadline_ids: payload?.deadlineIds ?? null,
      min_grade_info: payload?.minGradeInfo ?? null,
    }),
  });
}
