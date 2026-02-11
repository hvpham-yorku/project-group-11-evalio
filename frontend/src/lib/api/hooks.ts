import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { coursesApi, assessmentsApi, analysisApi, Course, Assessment, AnalyzeResponse, SimulateResponse } from "./client"

// ============ COURSES ============

export const useCourses = () => {
  return useQuery({
    queryKey: ["courses"],
    queryFn: () => coursesApi.list(),
  })
}

export const useCourse = (courseId: number | null) => {
  return useQuery({
    queryKey: ["courses", courseId],
    queryFn: () => courseId ? coursesApi.get(courseId) : Promise.reject("No course ID"),
    enabled: !!courseId,
  })
}

export const useCreateCourse = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ name, target_grade }: { name: string; target_grade: number }) =>
      coursesApi.create(name, target_grade),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["courses"] })
    },
  })
}

export const useUpdateCourse = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ courseId, data }: { courseId: number; data: { name?: string; target_grade?: number } }) =>
      coursesApi.update(courseId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["courses"] })
    },
  })
}

export const useDeleteCourse = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (courseId: number) => coursesApi.delete(courseId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["courses"] })
    },
  })
}

// ============ ASSESSMENTS ============

export const useCreateAssessment = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ courseId, assessment }: {
      courseId: number
      assessment: { name: string; weight: number; current_score?: number | null; due_date?: string | null }
    }) => assessmentsApi.create(courseId, assessment),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["courses"] })
    },
  })
}

export const useUpdateAssessment = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ assessmentId, assessment }: {
      assessmentId: number
      assessment: { name: string; weight: number; current_score?: number | null; due_date?: string | null }
    }) => assessmentsApi.update(assessmentId, assessment),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["courses"] })
    },
  })
}

export const useDeleteAssessment = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (assessmentId: number) => assessmentsApi.delete(assessmentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["courses"] })
    },
  })
}

// ============ ANALYSIS ============

export const useAnalyze = (courseId: number | null, current_scores: Record<string, number> | null) => {
  return useQuery({
    queryKey: ["analyze", courseId, current_scores],
    queryFn: () => courseId && current_scores ? analysisApi.analyze(courseId, current_scores) : Promise.reject("Missing params"),
    enabled: !!courseId && !!current_scores,
  })
}

export const useSimulate = (courseId: number | null, hypothetical_scores: Record<string, number> | null) => {
  return useQuery({
    queryKey: ["simulate", courseId, hypothetical_scores],
    queryFn: () => courseId && hypothetical_scores ? analysisApi.simulate(courseId, hypothetical_scores) : Promise.reject("Missing params"),
    enabled: !!courseId && !!hypothetical_scores,
  })
}
