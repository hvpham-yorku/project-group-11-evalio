export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

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
  return request("/courses/");
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
  });
}

export function checkTarget(courseIndex: number, payload: { target: number }) {
  return request(`/courses/${courseIndex}/target`, {
    method: "POST",
    body: JSON.stringify(payload),
  }) as Promise<{
    target: number;
    current_standing: number;
    maximum_possible: number;
    feasible: boolean;
    explanation: string;
    york_equivalent: {
      letter: string;
      grade_point: number;
      description: string;
    };
    required_points: number;
    required_average: number;
    required_average_display: string;
    required_fraction_display: string;
    classification: string;
  }>;
}
