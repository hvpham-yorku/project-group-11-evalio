export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

export type CourseAssessment = {
  name: string;
  weight: number;
  raw_score?: number | null;
  total_score?: number | null;
};

export type Course = {
  name: string;
  term?: string | null;
  assessments: CourseAssessment[];
};

export type YorkEquivalent = {
  letter: string;
  grade_point: number;
  description: string;
};

export type TargetCheckResponse = {
  target: number;
  current_standing: number;
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
  course_index: number;
  current_standing: number;
  assessments: Array<{
    name: string;
    weight: number;
    raw_score: number | null;
    total_score: number | null;
  }>;
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
};

async function request(path: string, options?: RequestInit) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
  });

  if (!response.ok) {
    let message = `Request failed: ${response.status}`;
    try {
      const body = await response.json();
      if (body?.detail) message = body.detail;
    } catch {
      // keep fallback message
    }
    throw new Error(message);
  }

  return response.json();
}

export function listCourses() {
  return request("/courses/") as Promise<Course[]>;
}

export function createCourse(payload: {
  name: string;
  term?: string | null;
  assessments: Array<{
    name: string;
    weight: number;
    raw_score?: number | null;
    total_score?: number | null;
  }>;
}) {
  return request("/courses/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateCourseWeights(
  courseIndex: number,
  payload: { assessments: Array<{ name: string; weight: number }> }
) {
  return request(`/courses/${courseIndex}/weights`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function updateCourseGrades(
  courseIndex: number,
  payload: {
    assessments: Array<{
      name: string;
      raw_score: number | null;
      total_score: number | null;
    }>;
  }
) {
  return request(`/courses/${courseIndex}/grades`, {
    method: "PUT",
    body: JSON.stringify(payload),
  }) as Promise<UpdateCourseGradesResponse>;
}

export function checkTarget(courseIndex: number, payload: { target: number }) {
  return request(`/courses/${courseIndex}/target`, {
    method: "POST",
    body: JSON.stringify(payload),
  }) as Promise<TargetCheckResponse>;
}

export function runWhatIf(
  courseIndex: number,
  payload: { assessment_name: string; hypothetical_score: number }
) {
  return request(`/courses/${courseIndex}/whatif`, {
    method: "POST",
    body: JSON.stringify(payload),
  }) as Promise<WhatIfResponse>;
}

export function getMinimumRequired(
  courseIndex: number,
  payload: { target: number; assessment_name: string }
) {
  return request(`/courses/${courseIndex}/minimum-required`, {
    method: "POST",
    body: JSON.stringify(payload),
  }) as Promise<MinimumRequiredResponse>;
}
