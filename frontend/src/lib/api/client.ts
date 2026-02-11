const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

export interface Assessment {
  id: number
  course_id: number
  name: string
  weight: number
  current_score: number | null
  due_date: string | null
  created_at: string
}

export interface Course {
  id: number
  name: string
  target_grade: number
  assessments: Assessment[]
  created_at: string
  updated_at: string
}

export interface RiskRange {
  minimum: number
  safe: number
  stretch: number
}

export interface AnalyzeResponse {
  required_score: number
  is_achievable: boolean
  current_average: number
  target_grade: number
  risk_ranges: RiskRange
  completed_assessments: Record<string, number>
}

export interface SimulateResponse {
  projected_final_grade: number
  breakdown: Record<string, number>
  status: "above" | "on_track" | "below"
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || response.statusText)
  }
  return response.json()
}

export const coursesApi = {
  list: async (): Promise<Course[]> => {
    const res = await fetch(`${API_BASE}/courses`)
    return handleResponse(res)
  },

  get: async (courseId: number): Promise<Course> => {
    const res = await fetch(`${API_BASE}/courses/${courseId}`)
    return handleResponse(res)
  },

  create: async (name: string, target_grade: number): Promise<Course> => {
    const res = await fetch(`${API_BASE}/courses`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, target_grade }),
    })
    return handleResponse(res)
  },

  update: async (courseId: number, data: { name?: string; target_grade?: number }): Promise<Course> => {
    const res = await fetch(`${API_BASE}/courses/${courseId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
    return handleResponse(res)
  },

  delete: async (courseId: number): Promise<void> => {
    const res = await fetch(`${API_BASE}/courses/${courseId}`, { method: "DELETE" })
    await handleResponse(res)
  },
}

export const assessmentsApi = {
  create: async (courseId: number, assessment: {
    name: string
    weight: number
    current_score?: number | null
    due_date?: string | null
  }): Promise<Assessment> => {
    const res = await fetch(`${API_BASE}/courses/${courseId}/assessments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(assessment),
    })
    return handleResponse(res)
  },

  update: async (assessmentId: number, assessment: {
    name: string
    weight: number
    current_score?: number | null
    due_date?: string | null
  }): Promise<Assessment> => {
    const res = await fetch(`${API_BASE}/assessments/${assessmentId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(assessment),
    })
    return handleResponse(res)
  },

  delete: async (assessmentId: number): Promise<void> => {
    const res = await fetch(`${API_BASE}/assessments/${assessmentId}`, { method: "DELETE" })
    await handleResponse(res)
  },
}

export const analysisApi = {
  analyze: async (courseId: number, current_scores: Record<string, number>): Promise<AnalyzeResponse> => {
    const res = await fetch(`${API_BASE}/courses/${courseId}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ current_scores }),
    })
    return handleResponse(res)
  },

  simulate: async (courseId: number, hypothetical_scores: Record<string, number>): Promise<SimulateResponse> => {
    const res = await fetch(`${API_BASE}/courses/${courseId}/simulate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hypothetical_scores }),
    })
    return handleResponse(res)
  },
}

export interface ParsedSyllabus {
  course_name: string
  extracted_text_preview: string
  assessments: { name: string; weight: number }[]
  total_weight: number
}

export const uploadApi = {
  parseSyllabus: async (file: File): Promise<ParsedSyllabus> => {
    const formData = new FormData()
    formData.append("file", file)
    const res = await fetch(`${API_BASE}/upload-syllabus`, {
      method: "POST",
      body: formData,
    })
    return handleResponse(res)
  },

  batchCreateAssessments: async (courseId: number, assessments: { name: string; weight: number; current_score?: number | null }[]): Promise<void> => {
    const res = await fetch(`${API_BASE}/courses/${courseId}/assessments/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(assessments),
    })
    return handleResponse(res)
  },
}
