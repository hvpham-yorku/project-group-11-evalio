"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Plus,
  Trash2,
} from "lucide-react";
import { confirmExtraction } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/errors";
import { useSetupCourse } from "@/app/setup/course-context";

type EditableAssessment = {
  id: string;
  name: string;
  weight: number;
  rule?: string | null;
  rule_type?: string | null;
  rule_config?: Record<string, unknown> | null;
  total_count?: number | null;
  effective_count?: number | null;
  is_bonus?: boolean;
  children?: EditableAssessment[];
};

function updateAssessmentById(
  items: EditableAssessment[],
  id: string,
  patch: Partial<EditableAssessment>
): EditableAssessment[] {
  return items.map((item) => {
    if (item.id === id) return { ...item, ...patch };
    if (item.children?.length) {
      return { ...item, children: updateAssessmentById(item.children, id, patch) };
    }
    return item;
  });
}

function removeAssessmentById(items: EditableAssessment[], id: string): EditableAssessment[] {
  return items
    .filter((item) => item.id !== id)
    .map((item) =>
      item.children?.length
        ? { ...item, children: removeAssessmentById(item.children, id) }
        : item
    );
}

function addChildToParent(
  items: EditableAssessment[],
  parentId: string,
  child: EditableAssessment
): EditableAssessment[] {
  return items.map((item) => {
    if (item.id === parentId) {
      return { ...item, children: [...(item.children ?? []), child] };
    }
    if (item.children?.length) {
      return { ...item, children: addChildToParent(item.children, parentId, child) };
    }
    return item;
  });
}

function findAssessmentById(
  items: EditableAssessment[],
  id: string
): EditableAssessment | null {
  for (const item of items) {
    if (item.id === id) return item;
    if (item.children?.length) {
      const found = findAssessmentById(item.children, id);
      if (found) return found;
    }
  }
  return null;
}

function getChildBaseLabel(parentName: string): string {
  const name = parentName.trim().toLowerCase();
  if (name.includes("lab test")) return "Lab test";
  if (name.includes("quiz")) return "Quiz";
  if (name.includes("lab")) return "Lab";
  if (name.includes("homework")) return "Homework";
  if (name.includes("assignment")) return "Assignment";
  if (name.includes("test")) return "Test";
  if (name.includes("exam")) return "Exam";
  return "Item";
}

const BEST_OF_RULE_REGEX = /best\s+(\d+)\s+(?:(?:out\s+of|of)\s+)?(\d+)/i;
const DROP_LOWEST_RULE_REGEX = /\bdrop\s+lowest(?:\s+(\d+))?\b/i;
const DROP_LOWEST_ALT_RULE_REGEX = /\bdrop\s+(\d+)\s+lowest\b/i;
const MANDATORY_PASS_RULE_REGEX = /\bmandatory\s+pass\b|\bmust\s+pass\b/i;
const MANDATORY_PASS_THRESHOLD_REGEX =
  /(?:>=|at\s+least|minimum|threshold)\s*(\d+(?:\.\d+)?)/i;
const TOTAL_COUNT_REGEX = /\b(?:out\s+of|of)\s+(\d+)\b/i;
const LEADING_COUNT_REGEX = /^(\d+)\s+/;
const SUPPORTED_RULE_TYPES = new Set([
  "best_of",
  "drop_lowest",
  "pure_multiplicative",
  "mandatory_pass",
]);

function parsePositiveInteger(value: unknown): number | null {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return Math.floor(numeric);
}

function deriveRuleMetadata(
  ruleText: string,
  assessmentName: string
): Pick<
  EditableAssessment,
  "rule_type" | "total_count" | "effective_count" | "rule_config"
> {
  const normalizedRule = ruleText.trim();
  if (!normalizedRule) {
    return {
      rule_type: null,
      total_count: null,
      effective_count: null,
      rule_config: null,
    };
  }

  const bestMatch = BEST_OF_RULE_REGEX.exec(normalizedRule);
  if (bestMatch) {
    const effectiveCount = parsePositiveInteger(bestMatch[1]);
    const totalCount = parsePositiveInteger(bestMatch[2]);
    return {
      rule_type: "best_of",
      effective_count: effectiveCount,
      total_count: totalCount,
      rule_config: {
        ...(effectiveCount ? { best_count: effectiveCount } : {}),
        ...(totalCount ? { total_count: totalCount } : {}),
      },
    };
  }

  const altDropMatch = DROP_LOWEST_ALT_RULE_REGEX.exec(normalizedRule);
  const dropMatch = DROP_LOWEST_RULE_REGEX.exec(normalizedRule);
  if (altDropMatch || dropMatch) {
    const dropCount =
      parsePositiveInteger(altDropMatch?.[1]) ??
      parsePositiveInteger(dropMatch?.[1]) ??
      1;

    const totalCountFromRule = parsePositiveInteger(TOTAL_COUNT_REGEX.exec(normalizedRule)?.[1]);
    const totalCountFromName = parsePositiveInteger(LEADING_COUNT_REGEX.exec(assessmentName.trim())?.[1]);
    const totalCount = totalCountFromRule ?? totalCountFromName;
    const effectiveCount = totalCount ? Math.max(1, totalCount - dropCount) : null;

    return {
      rule_type: "drop_lowest",
      total_count: totalCount,
      effective_count: effectiveCount,
      rule_config: {
        drop_count: dropCount,
        ...(totalCount ? { total_count: totalCount } : {}),
      },
    };
  }

  if (MANDATORY_PASS_RULE_REGEX.test(normalizedRule)) {
    const thresholdMatch = MANDATORY_PASS_THRESHOLD_REGEX.exec(normalizedRule);
    const threshold = Number.parseFloat(thresholdMatch?.[1] ?? "50");
    const safeThreshold =
      Number.isFinite(threshold) && threshold >= 0 && threshold <= 100
        ? threshold
        : 50;
    return {
      rule_type: "mandatory_pass",
      total_count: null,
      effective_count: null,
      rule_config: { pass_threshold: safeThreshold },
    };
  }

  return {
    rule_type: null,
    total_count: null,
    effective_count: null,
    rule_config: null,
  };
}

function getPassThreshold(assessment: EditableAssessment): number {
  const config = assessment.rule_config ?? {};
  const raw = (config as Record<string, unknown>).pass_threshold;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return 50;
  return Math.max(0, Math.min(parsed, 100));
}

function getRuleSummaryLabel(assessment: EditableAssessment): string | null {
  const effectiveCount = parsePositiveInteger(assessment.effective_count);
  const totalCount = parsePositiveInteger(assessment.total_count);

  if (assessment.rule_type === "best_of") {
    if (effectiveCount && totalCount) {
      return `Best ${effectiveCount} of ${totalCount} count`;
    }
    return "Best-of grading applied";
  }

  if (assessment.rule_type === "drop_lowest") {
    if (effectiveCount && totalCount) {
      const dropped = Math.max(0, totalCount - effectiveCount);
      return `Drop lowest ${dropped} of ${totalCount}`;
    }
    return "Drop-lowest grading applied";
  }

  if (assessment.rule_type === "pure_multiplicative") {
    return "All sub-items count";
  }

  if (assessment.rule_type === "mandatory_pass") {
    return `Must pass (\u2265${getPassThreshold(assessment)}%)`;
  }

  return null;
}

function findAssessmentValidationError(items: EditableAssessment[]): string | null {
  const WEIGHT_TOLERANCE = 0.01;

  for (const assessment of items) {
    const trimmedName = assessment.name.trim();
    if (!trimmedName) {
      return "Every assessment must have a name.";
    }

    if (!Number.isFinite(assessment.weight) || assessment.weight <= 0) {
      return `Assessment "${trimmedName}" must have a positive weight.`;
    }

    if (assessment.is_bonus && assessment.rule_type === "mandatory_pass") {
      return `Assessment "${trimmedName}" cannot be both bonus and mandatory pass.`;
    }

    const children = Array.isArray(assessment.children) ? assessment.children : [];
    if (children.length > 0) {
      for (const child of children) {
        const childName = child.name.trim();
        if (!childName) {
          return `Assessment "${trimmedName}" has a child item with an empty name.`;
        }
        if (!Number.isFinite(child.weight) || child.weight <= 0) {
          return `Child item "${childName}" under "${trimmedName}" must have a positive weight.`;
        }
      }

      const childWeightSum = children.reduce(
        (sum, child) => sum + (Number.isFinite(child.weight) ? child.weight : 0),
        0
      );

      if (assessment.rule_type === "best_of" || assessment.rule_type === "drop_lowest") {
        if (childWeightSum + WEIGHT_TOLERANCE < assessment.weight) {
          return `Assessment "${trimmedName}" needs child weights totaling at least ${assessment.weight}%.`;
        }
      } else if (Math.abs(childWeightSum - assessment.weight) > WEIGHT_TOLERANCE) {
        return `Assessment "${trimmedName}" requires child weights to sum to ${assessment.weight}% (currently ${childWeightSum.toFixed(2)}%).`;
      }
    }

    const nestedError = findAssessmentValidationError(children);
    if (nestedError) return nestedError;
  }

  return null;
}

type GradeBoundary = {
  letter: string;
  minLabel: string; // e.g., "90–100" or "below 50"
  points: string; // e.g., "9.0"
  descriptor: string; // e.g., "Excellent"
};

export default function StructureStep() {
  const router = useRouter();
  const { extractionResult, setCourseId, institutionalGradingRules, setInstitutionalGradingRules } =
    useSetupCourse();

  const [courseName, setCourseName] = useState("");
  const [termLabel, setTermLabel] = useState("");
  const [termYear, setTermYear] = useState(String(new Date().getFullYear()));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const [expandedByKey, setExpandedByKey] = useState<Record<string, boolean>>({});
  const [rulesOpenById, setRulesOpenById] = useState<Record<string, boolean>>({});

  // Local editable copy of extracted assessments
  const [assessments, setAssessments] = useState<EditableAssessment[]>([]);

  // Institutional grading rules UI state
  const [institutionalOpen, setInstitutionalOpen] = useState(false);
  const [institutionName, setInstitutionName] = useState("York University");
  const [scaleName, setScaleName] = useState("9.0");

  const [gradeBoundaries, setGradeBoundaries] = useState<GradeBoundary[]>([
    { letter: "A+", minLabel: "90–100", points: "9.0", descriptor: "Excellent" },
    { letter: "A", minLabel: "80–89", points: "8.0", descriptor: "Excellent" },
    { letter: "B+", minLabel: "75–79", points: "7.0", descriptor: "Very Good" },
    { letter: "B", minLabel: "70–74", points: "6.0", descriptor: "Good" },
    { letter: "C+", minLabel: "65–69", points: "5.0", descriptor: "Competent" },
    { letter: "C", minLabel: "60–64", points: "4.0", descriptor: "Fair" },
    { letter: "D+", minLabel: "55–59", points: "3.0", descriptor: "Pass" },
    { letter: "D", minLabel: "50–54", points: "2.0", descriptor: "Pass" },
    { letter: "F", minLabel: "below 50", points: "0.0", descriptor: "Fail" },
  ]);

  const [boundaryHandling, setBoundaryHandling] = useState<"round-up" | "strict">("round-up");
  const [rounding, setRounding] = useState<"one-decimal" | "none">("one-decimal");
  const yearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const startYear = 1950;
    const endYear = currentYear + 10;
    return Array.from({ length: endYear - startYear + 1 }, (_, index) => String(startYear + index));
  }, []);

  const extractedCourseCode =
    typeof extractionResult?.course_code === "string" ? extractionResult.course_code.trim() : "";

  // Bootstrap course name from extracted course code (if present)
  useEffect(() => {
    if (!extractedCourseCode) return;
    if (courseName.trim()) return;
    setCourseName(extractedCourseCode);
  }, [extractedCourseCode, courseName]);

  useEffect(() => {
    if (!institutionalGradingRules) return;
    setInstitutionName(institutionalGradingRules.institution);
    setScaleName(institutionalGradingRules.scale);
    setGradeBoundaries(institutionalGradingRules.grade_boundaries);
  }, [institutionalGradingRules]);

  // Convert extractionResult.assessments into local editable state (once per new extraction)
  useEffect(() => {
    const incoming = Array.isArray(extractionResult?.assessments) ? extractionResult.assessments : [];
    const normalize = (items: any[], prefix = "a"): EditableAssessment[] =>
      items.map((it, idx) => {
        const id = typeof it?.id === "string" ? it.id : `${prefix}-${idx}-${Date.now()}`;
        const childrenRaw = Array.isArray(it?.children) ? it.children : [];
        return {
          id,
          name: typeof it?.name === "string" ? it.name : "",
          weight: Number.isFinite(Number(it?.weight)) ? Number(it.weight) : 0,
          rule: typeof it?.rule === "string" ? it.rule : it?.rule ?? "",
          rule_type: typeof it?.rule_type === "string" ? it.rule_type : null,
          rule_config:
            it?.rule_config && typeof it.rule_config === "object"
              ? it.rule_config
              : null,
          total_count: Number.isFinite(Number(it?.total_count)) ? Number(it.total_count) : null,
          effective_count: Number.isFinite(Number(it?.effective_count)) ? Number(it.effective_count) : null,
          is_bonus: Boolean(it?.is_bonus),
          children: childrenRaw.length ? normalize(childrenRaw, `${prefix}-${idx}`) : [],
        };
      });

    setAssessments(normalize(incoming));
  }, [extractionResult]);

  const totalWeight = useMemo(() => {
    const sumTopLevel = assessments.reduce(
      (sum, a) =>
        sum +
        (!a.is_bonus && Number.isFinite(a.weight) ? a.weight : 0),
      0
    );
    return Number(sumTopLevel.toFixed(2));
  }, [assessments]);

  const weightStatus = useMemo(() => {
    if (totalWeight === 100) {
      return {
        bg: "bg-[#E8F2EA]",
        border: "border-[#D4CFC7]",
        text: "text-[#6B9B7A]",
        message: "Perfect! Your non-bonus weights add up to 100%.",
      };
    }
    if (totalWeight < 100) {
      return {
        bg: "bg-[#FDF3E7]",
        border: "border-[#F1DCC4]",
        text: "text-[#C9945F]",
        message: `You need ${(100 - totalWeight).toFixed(0)}% more non-bonus weight to reach 100%.`,
      };
    }
    return {
      bg: "bg-[#F9EAEA]",
      border: "border-[#F1DCC4]",
      text: "text-[#B86B6B]",
      message: `Non-bonus weights exceed 100% by ${(totalWeight - 100).toFixed(0)}%. Please adjust to continue.`,
    };
  }, [totalWeight]);

  const updateAssessment = (id: string, patch: Partial<EditableAssessment>) => {
    setAssessments((prev) => updateAssessmentById(prev, id, patch));
  };

  const deleteAssessment = (id: string) => {
    setAssessments((prev) => removeAssessmentById(prev, id));
  };

  const addAssessment = () => {
    setAssessments((prev) => [
      ...prev,
      {
        id: `assessment-${Date.now()}`,
        name: "",
        weight: Number.NaN,
        rule: "",
        rule_type: null,
        rule_config: null,
        is_bonus: false,
        children: [],
      },
    ]);
  };

  const handleAddChild = (parentId: string) => {
    setAssessments((prev) => {
      const parent = findAssessmentById(prev, parentId);
      const currentChildren = Array.isArray(parent?.children) ? parent.children : [];
      const nextIndex = currentChildren.length + 1;
      const inferredName = `${getChildBaseLabel(parent?.name ?? "")} ${nextIndex}`;
      const newChild: EditableAssessment = {
        id: `${parentId}-child-${Date.now()}-${nextIndex}`,
        name: inferredName,
        weight: Number.NaN,
        rule: "",
        rule_type: null,
        rule_config: null,
        is_bonus: false,
        children: [],
      };
      return addChildToParent(prev, parentId, newChild);
    });
    setExpandedByKey((prev) => ({ ...prev, [parentId]: true }));
  };

  const toggleExpanded = (key: string) => {
    setExpandedByKey((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleRulesOpen = (id: string) => {
    setRulesOpenById((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const addGradeBoundary = () => {
    setGradeBoundaries((prev) => [
      ...prev,
      { letter: "", minLabel: "", points: "", descriptor: "" },
    ]);
  };

  const removeGradeBoundary = (index: number) => {
    setGradeBoundaries((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((_, idx) => idx !== index);
    });
  };

  const handleContinue = async () => {
    setError("");

    if (!extractionResult) {
      setError("Please upload an outline first.");
      return;
    }

    if (!courseName.trim()) {
      setError("Please enter a course name.");
      return;
    }

    const assessmentValidationError = findAssessmentValidationError(assessments);
    if (assessmentValidationError) {
      setError(assessmentValidationError);
      return;
    }

    if (totalWeight !== 100) {
      setError("Total non-bonus assessment weight must equal 100% to continue.");
      return;
    }

    try {
      setSaving(true);
      const combinedTerm = [termLabel.trim(), termYear.trim()].filter(Boolean).join(" ");
      const selectedRules = {
        institution: institutionName,
        scale: scaleName,
        grade_boundaries: gradeBoundaries,
      };

      // Build a modified extraction payload that keeps the original extractionResult
      // but overrides editable fields from this page.
      const patchedExtraction = {
        ...extractionResult,
        course_name: courseName.trim(),
        term: combinedTerm || null,
        assessments: assessments,
        institutional_grading_rules: {
          institution: selectedRules.institution,
          scale: selectedRules.scale,
          grade_boundaries: gradeBoundaries,
          boundary_handling: boundaryHandling,
          rounding: rounding,
        },
      };

      const response = await confirmExtraction({
        course_name: courseName.trim() || "Untitled Course",
        term: combinedTerm || null,
        extraction_result: patchedExtraction,
      });

      setInstitutionalGradingRules(selectedRules);
      setCourseId(response.course_id);
      router.push("/setup/grades");
    } catch (e) {
      setError(getApiErrorMessage(e, "Failed to confirm extracted structure."));
    } finally {
      setSaving(false);
    }
  };

  const renderAssessmentCard = (a: EditableAssessment, depth = 0, nodeKey = "root") => {
    const children = Array.isArray(a.children) ? a.children : [];
    const hasChildren = children.length > 0;
    const expanded = !!expandedByKey[a.id];
    const isBonus = Boolean(a.is_bonus);
    const isMandatoryPass = a.rule_type === "mandatory_pass";
    const passThreshold = getPassThreshold(a);
    const ruleSummaryLabel = getRuleSummaryLabel(a);
    const hasUnsupportedRule =
      (Boolean((a.rule ?? "").trim()) && !a.rule_type) ||
      (Boolean(a.rule_type) && !SUPPORTED_RULE_TYPES.has(String(a.rule_type)));
    const rulesOpenByDefault = Boolean(
      (a.rule ?? "").trim() || ruleSummaryLabel || hasUnsupportedRule
    );
    const rulesOpen = rulesOpenById[a.id] ?? rulesOpenByDefault;

    return (
      <div key={nodeKey} className="space-y-3" style={{ marginLeft: `${depth * 16}px` }}>
        <div
          className={`rounded-2xl border px-4 py-4 ${
            isBonus
              ? "border-[#D4CFC7] bg-[#E8F2EA]"
              : "border-[#D4CFC7] bg-[#F5F1EB]"
          }`}
        >
          <div className="flex items-start gap-3">
            {hasChildren ? (
              <button
                type="button"
                onClick={() => toggleExpanded(a.id)}
                className="mt-2 text-[#6B6560] transition hover:text-[#3A3530]"
                aria-label={expanded ? "Collapse" : "Expand"}
              >
                {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              </button>
            ) : (
              <div className="w-[18px]" />
            )}

            <div className="flex-1 space-y-3">
              <div className="flex items-start gap-3">
                <div className="flex-1">
                  <input
                    value={a.name}
                    onChange={(e) => {
                      const nextName = e.target.value;
                      const derived = deriveRuleMetadata(a.rule ?? "", nextName);
                      updateAssessment(a.id, {
                        name: nextName,
                        ...derived,
                      });
                    }}
                    placeholder="Assessment name"
                    className="w-full rounded-xl border border-[#D4CFC7] bg-[#FCFAF7] px-3 py-2 text-sm text-[#3A3530]"
                  />
                  <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                    {isBonus ? (
                      <span className="rounded-full border border-[#D4CFC7] bg-[#E8F2EA] px-2 py-1 font-semibold text-[#6B9B7A]">
                        Bonus
                      </span>
                    ) : null}
                    {ruleSummaryLabel ? (
                      <span className="rounded-full border border-[#C4D6E4] bg-[#E8EFF5] px-2 py-1 text-[#6B8BA8]">
                        {ruleSummaryLabel}
                      </span>
                    ) : null}
                    {hasUnsupportedRule ? (
                      <span className="rounded-full border border-[#F1DCC4] bg-[#FDF3E7] px-2 py-1 font-semibold text-[#C9945F]">
                        Unsupported rule text
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="w-24">
                  <div className="relative">
                    <input
                      type="number"
                      value={Number.isFinite(a.weight) ? a.weight : ""}
                      onChange={(e) =>
                        updateAssessment(a.id, {
                          weight: e.target.value === "" ? Number.NaN : Number(e.target.value),
                        })
                      }
                      className="w-full rounded-xl border border-[#D4CFC7] bg-[#FCFAF7] px-3 py-2 text-center text-sm text-[#3A3530]"
                      min={0}
                      max={100}
                      step={1}
                    />
                    {!Number.isFinite(a.weight) ? (
                      <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-[#C4B5A6]">
                        -
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-center text-[11px] text-[#6B6560]">
                    {isBonus ? "Bonus weight" : "% of grade"}
                  </p>
                </div>
              </div>

              {/* progress bar */}
              <div className="h-2 w-full rounded-full bg-[#E8E3DC]">
                <div
                  className="h-full rounded-full bg-[#5F7A8A]"
                  style={{ width: `${Math.max(0, Math.min(a.weight, 100))}%` }}
                />
              </div>

              {/* rules dropdown */}
              <div className="rounded-xl border border-[#D4CFC7] bg-[#E8E3DC] px-3 py-3">
                <button
                  type="button"
                  onClick={() => toggleRulesOpen(a.id)}
                  className="w-full flex items-center justify-between text-left"
                >
                  <p className="text-[11px] font-semibold text-[#6B6560]">Rules</p>
                  <span className="text-[#6B6560]">
                    {rulesOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </span>
                </button>

                {rulesOpen ? (
                  <>
                    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <label className="text-[11px] text-[#6B6560]">
                        Rule Type
                        <select
                          value={a.rule_type ?? ""}
                          onChange={(e) => {
                            const nextType = e.target.value || null;
                            if (nextType === null) {
                              updateAssessment(a.id, {
                                rule_type: null,
                                rule_config: null,
                                total_count: null,
                                effective_count: null,
                              });
                              return;
                            }

                            if (nextType === "mandatory_pass") {
                              updateAssessment(a.id, {
                                rule_type: "mandatory_pass",
                                rule_config: { pass_threshold: passThreshold || 50 },
                                total_count: null,
                                effective_count: null,
                                is_bonus: false,
                              });
                              return;
                            }

                            if (nextType === "best_of") {
                              const totalCount =
                                parsePositiveInteger(a.total_count) ??
                                (a.children?.length ? a.children.length : null);
                              const effectiveCount =
                                parsePositiveInteger(a.effective_count) ??
                                (totalCount ? Math.max(1, totalCount - 1) : 1);
                              updateAssessment(a.id, {
                                rule_type: "best_of",
                                total_count: totalCount,
                                effective_count: effectiveCount,
                                rule_config: {
                                  best_count: effectiveCount,
                                  ...(totalCount ? { total_count: totalCount } : {}),
                                },
                              });
                              return;
                            }

                            if (nextType === "drop_lowest") {
                              const totalCount =
                                parsePositiveInteger(a.total_count) ??
                                (a.children?.length ? a.children.length : null);
                              const effectiveCount =
                                parsePositiveInteger(a.effective_count) ??
                                (totalCount ? Math.max(1, totalCount - 1) : null);
                              const dropCount =
                                totalCount && effectiveCount
                                  ? Math.max(1, totalCount - effectiveCount)
                                  : 1;
                              updateAssessment(a.id, {
                                rule_type: "drop_lowest",
                                total_count: totalCount,
                                effective_count: effectiveCount,
                                rule_config: {
                                  drop_count: dropCount,
                                  ...(totalCount ? { total_count: totalCount } : {}),
                                },
                              });
                              return;
                            }

                            updateAssessment(a.id, {
                              rule_type: nextType,
                              rule_config: null,
                              total_count: null,
                              effective_count: null,
                            });
                          }}
                          className="mt-1 w-full rounded-xl border border-[#D4CFC7] bg-[#FCFAF7] px-3 py-2 text-sm text-[#3A3530]"
                        >
                          <option value="">None</option>
                          <option value="best_of">Best Of</option>
                          <option value="drop_lowest">Drop Lowest</option>
                          <option value="pure_multiplicative">All Sub-items Count</option>
                          <option value="mandatory_pass">
                            Mandatory Pass
                          </option>
                        </select>
                      </label>

                      <label className="flex items-center gap-2 rounded-xl border border-[#D4CFC7] bg-[#FCFAF7] px-3 py-2 text-sm text-[#3A3530]">
                        <input
                          type="checkbox"
                          checked={isBonus}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            updateAssessment(a.id, {
                              is_bonus: checked,
                              ...(checked
                                ? {
                                    rule_type:
                                      a.rule_type === "mandatory_pass"
                                        ? null
                                        : a.rule_type,
                                    rule_config:
                                      a.rule_type === "mandatory_pass"
                                        ? null
                                        : a.rule_config,
                                  }
                                : {}),
                            });
                          }}
                        />
                        Bonus Assessment
                      </label>
                    </div>

                    {isMandatoryPass ? (
                      <label className="mt-2 block text-[11px] text-[#6B6560]">
                        Mandatory pass threshold (%)
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={1}
                          value={passThreshold}
                          onChange={(e) => {
                            const nextThreshold = Number(e.target.value);
                            const safeThreshold =
                              Number.isFinite(nextThreshold)
                                ? Math.max(0, Math.min(nextThreshold, 100))
                                : 50;
                            updateAssessment(a.id, {
                              rule_config: { pass_threshold: safeThreshold },
                            });
                          }}
                          className="mt-1 w-full rounded-xl border border-[#D4CFC7] bg-[#FCFAF7] px-3 py-2 text-sm text-[#3A3530]"
                        />
                      </label>
                    ) : null}

                    <input
                      value={a.rule ?? ""}
                      onChange={(e) => {
                        const nextRule = e.target.value;
                        const derived = deriveRuleMetadata(nextRule, a.name);
                        const activatingMandatory =
                          derived.rule_type === "mandatory_pass";
                        updateAssessment(a.id, {
                          rule: nextRule,
                          ...derived,
                          ...(activatingMandatory ? { is_bonus: false } : {}),
                        });
                      }}
                      placeholder="e.g., Best 10 of 11 quizzes count"
                      className="mt-2 w-full rounded-xl border border-[#D4CFC7] bg-[#FCFAF7] px-3 py-2 text-sm text-[#3A3530]"
                    />
                    {hasUnsupportedRule ? (
                      <p className="mt-2 text-[11px] text-[#C9945F]">
                        Unsupported rule text is preserved for review but not treated as fully supported.
                      </p>
                    ) : null}
                  </>
                ) : null}
              </div>

              {!hasChildren ? (
                <div>
                  <button
                    type="button"
                    onClick={() => handleAddChild(a.id)}
                    className="inline-flex items-center gap-1 rounded-lg border border-[#D4CFC7] bg-white px-3 py-2 text-xs font-medium text-[#3A3530] transition hover:bg-[#F5F1EB]"
                  >
                    <Plus size={14} /> Add item
                  </button>
                </div>
              ) : null}

              {/* children */}
              {hasChildren && expanded ? (
                <div className="mt-2 space-y-2 border-l border-[#D4CFC7] pl-3">
                  {children.map((c, idx) => (
                    <div
                      key={`${nodeKey}-${idx}`}
                      className="rounded-xl border border-[#D4CFC7] bg-[#FCFAF7] px-3 py-3"
                    >
                      <div className="flex items-center justify-between gap-3 mb-2">
                        <input
                          value={c.name}
                          onChange={(e) => updateAssessment(c.id, { name: e.target.value })}
                          placeholder="Assessment name"
                          className="w-full rounded-lg border border-[#D4CFC7] bg-[#FCFAF7] px-3 py-2 text-xs text-[#3A3530]"
                        />
                        <button
                          type="button"
                          onClick={() => deleteAssessment(c.id)}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[#D4CFC7] text-[#6B6560] transition hover:bg-[#F9EAEA] hover:text-[#B86B6B]"
                          aria-label={`Delete ${c.name || "item"}`}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <div className="flex items-center justify-end gap-2">
                        <div className="relative">
                          <input
                            type="number"
                            value={Number.isFinite(c.weight) ? c.weight : ""}
                            onChange={(e) =>
                              updateAssessment(c.id, {
                                weight: e.target.value === "" ? Number.NaN : Number(e.target.value),
                              })
                            }
                            min={0}
                            max={100}
                            step={1}
                            className="h-9 w-20 rounded-lg border border-[#D4CFC7] bg-[#FCFAF7] px-2 text-right text-xs leading-5 shadow-sm focus:outline-none"
                          />
                          {!Number.isFinite(c.weight) ? (
                            <span className="pointer-events-none absolute inset-0 flex items-center justify-end px-2 text-xs text-[#C4B5A6]">
                              -
                            </span>
                          ) : null}
                        </div>
                        <p className="text-xs text-[#6B6560]">% of grade</p>
                      </div>
                    </div>
                  ))}
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => handleAddChild(a.id)}
                      className="inline-flex items-center gap-1 rounded-lg border border-[#D4CFC7] bg-white px-3 py-2 text-xs font-medium text-[#3A3530] transition hover:bg-[#F5F1EB]"
                    >
                      <Plus size={14} /> Add item
                    </button>
                  </div>
                </div>
              ) : null}
            </div>

            <button
              type="button"
              onClick={() => deleteAssessment(a.id)}
              className="mt-1 text-[#C4B5A6] transition hover:text-[#B86B6B]"
              aria-label="Delete assessment"
            >
              <Trash2 size={18} />
            </button>
          </div>
        </div>

      </div>
    );
  };

  if (!extractionResult) {
    return (
      <div className="mx-auto max-w-5xl px-4 pb-20">
        <h2 className="text-[34px] font-semibold text-[#3A3530]">Course Structure</h2>
        <p className="mt-2 text-sm leading-relaxed text-[#6B6560]">
          No extracted outline is available. Upload a course outline first.
        </p>
        <button
          onClick={() => router.push("/setup/upload")}
          className="mt-8 rounded-xl bg-[#5F7A8A] px-6 py-3 font-semibold text-white shadow-sm transition hover:bg-[#6B8BA8]"
        >
          Go to Upload
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 pb-24">
      <h2 className="text-[34px] font-semibold text-[#3A3530]">Course Structure</h2>
      <p className="mt-2 text-sm leading-relaxed text-[#6B6560]">
        Review and adjust your course assessments, weights, and grading rules.
      </p>

      <div className="mt-6 space-y-4">
        <section className="rounded-2xl border border-[#D4CFC7] bg-white p-4 shadow-sm">
          <label className="mb-2 block text-sm text-[#3A3530]">Course Name</label>
          <input
            type="text"
            value={courseName}
            onChange={(e) => setCourseName(e.target.value)}
            className="w-full rounded-xl border border-[#D4CFC7] bg-[#F5F1EB] p-3 text-sm text-[#3A3530]"
            placeholder="Untitled course"
          />
        </section>

        <section className="rounded-2xl border border-[#D4CFC7] bg-white p-4 shadow-sm">
          <p className="mb-2 text-sm text-[#3A3530]">Academic Term</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-[#6B6560]">Term</label>
              <select
                value={termLabel}
                onChange={(e) => setTermLabel(e.target.value)}
                className="w-full rounded-xl border border-[#D4CFC7] bg-[#F5F1EB] p-3 text-sm text-[#3A3530]"
              >
                <option value="">Select term</option>
                <option value="Fall">Fall</option>
                <option value="Winter">Winter</option>
                <option value="Summer">Summer</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-[#6B6560]">Year</label>
              <select
                value={termYear}
                onChange={(e) => setTermYear(e.target.value)}
                className="w-full rounded-xl border border-[#D4CFC7] bg-[#F5F1EB] p-3 text-sm text-[#3A3530]"
              >
                {yearOptions.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {/* MAIN EDITOR CARD */}
        <section className="rounded-2xl border border-[#D4CFC7] bg-white p-4 shadow-sm">

        {/* Assessments header */}
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h3 className="text-base font-semibold text-[#3A3530]">Assessments</h3>
            <p className="mt-1 text-sm text-[#6B6560]">Define your course grading components</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-[#6B6560]">Non-bonus Weight</p>
            <p
              className={`text-4xl font-semibold leading-none ${
                totalWeight === 100 ? "text-[#6B9B7A]" : totalWeight < 100 ? "text-[#C9945F]" : "text-[#B86B6B]"
              }`}
            >
              {totalWeight}%
            </p>
          </div>
        </div>

        <div className="space-y-3">{assessments.map((a, i) => renderAssessmentCard(a, 0, `top-${i}`))}</div>

        <button
          type="button"
          onClick={addAssessment}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl border border-[#D4CFC7] py-3 text-sm font-medium text-[#6B6560] transition hover:border-[#5F7A8A] hover:text-[#5F7A8A]"
        >
          <Plus size={16} />
          Add Assessment
        </button>

        {/* weight status */}
        <div className="mt-6">
          <div className="mb-4 h-3 w-full rounded-full bg-[#E8E3DC]">
            <div
              className={`h-full rounded-full ${
                totalWeight === 100 ? "bg-[#6B9B7A]" : totalWeight < 100 ? "bg-[#C9945F]" : "bg-[#B86B6B]"
              }`}
              style={{ width: `${Math.max(0, Math.min(totalWeight, 100))}%` }}
            />
          </div>
          <div className={`flex items-center gap-3 p-4 rounded-xl text-sm border ${weightStatus.bg} ${weightStatus.border} ${weightStatus.text}`}>
            <CheckCircle2 size={18} />
            <p>{weightStatus.message}</p>
          </div>
        </div>
        </section>
      </div>

      {/* Institutional Grading Rules (accordion) */}
      <div className="mt-6 rounded-2xl border border-[#D4CFC7] bg-white p-6 shadow-sm">
        <button
          type="button"
          className="w-full flex items-start justify-between gap-4 text-left"
          onClick={() => setInstitutionalOpen((v) => !v)}
        >
          <div>
            <h3 className="text-base font-semibold text-[#3A3530]">
              Institutional Grading Rules ({institutionName || "York University"} Default)
            </h3>
            <p className="mt-1 text-sm text-[#5F7A8A]">
              Optional - Change to match your institution
            </p>
            <p className="mt-1 text-sm text-[#6B6560]">
              Used to evaluate your final percentage into letter grades and grade points.
            </p>
          </div>
          <div className="mt-1 text-[#6B6560]">{institutionalOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}</div>
        </button>

        {institutionalOpen ? (
          <div className="mt-5 space-y-5">
            {/* Institution + Scale rows */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-[#D4CFC7] bg-[#FCFAF7] px-4 py-3">
                <p className="text-sm text-[#6B6560]">Institution:</p>
                <input
                  value={institutionName}
                  onChange={(e) => setInstitutionName(e.target.value)}
                  className="rounded-xl border border-[#D4CFC7] bg-[#F5F1EB] px-3 py-2 text-right text-sm font-semibold text-[#3A3530] focus:outline-none focus:ring-2 focus:ring-[#5F7A8A]/30"
                />
              </div>
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-[#D4CFC7] bg-[#FCFAF7] px-4 py-3">
                <p className="text-sm text-[#6B6560]">Scale:</p>
                <select
                  value={scaleName}
                  onChange={(e) => setScaleName(e.target.value)}
                  className="rounded-xl border border-[#D4CFC7] bg-[#F5F1EB] px-3 py-2 text-right text-sm font-semibold text-[#3A3530] focus:outline-none focus:ring-2 focus:ring-[#5F7A8A]/30"
                >
                  <option value="4.0">4.0</option>
                  <option value="9.0">9.0</option>
                  <option value="10.0">10.0</option>
                </select>
              </div>
            </div>

            {/* Grade boundaries - exact inline format */}
            <div>
              <h4 className="mb-3 text-sm font-semibold text-[#3A3530]">Grade Boundaries</h4>
              <div className="space-y-2">
                {gradeBoundaries.map((g, idx) => (
                  <div key={idx} className="rounded-2xl border border-[#D4CFC7] bg-[#FCFAF7] px-4 py-3">
                    <div className="flex items-center gap-3 text-sm">
                      <input
                        value={g.letter}
                        onChange={(e) => {
                          setGradeBoundaries((prev) => {
                            const next = [...prev];
                            next[idx] = { ...next[idx], letter: e.target.value };
                            return next;
                          });
                        }}
                        className="w-14 rounded-lg border border-[#D4CFC7] bg-[#F5F1EB] px-2 py-1 text-center font-semibold text-[#3A3530] focus:outline-none focus:ring-2 focus:ring-[#5F7A8A]/30"
                      />

                      <span className="text-[#6B6560]">—</span>

                      <input
                        value={g.minLabel}
                        onChange={(e) => {
                          setGradeBoundaries((prev) => {
                            const next = [...prev];
                            next[idx] = { ...next[idx], minLabel: e.target.value };
                            return next;
                          });
                        }}
                        className="w-28 rounded-lg border border-[#D4CFC7] bg-[#F5F1EB] px-2 py-1 text-center text-[#3A3530] focus:outline-none focus:ring-2 focus:ring-[#5F7A8A]/30"
                      />

                      <span className="text-[#6B6560]">→</span>

                      <input
                        value={g.points}
                        onChange={(e) => {
                          setGradeBoundaries((prev) => {
                            const next = [...prev];
                            next[idx] = { ...next[idx], points: e.target.value };
                            return next;
                          });
                        }}
                        className="w-16 rounded-lg border border-[#D4CFC7] bg-[#F5F1EB] px-2 py-1 text-center text-[#5F7A8A] focus:outline-none focus:ring-2 focus:ring-[#5F7A8A]/30"
                      />

                      <span className="text-[#6B6560]">—</span>

                      <input
                        value={g.descriptor}
                        onChange={(e) => {
                          setGradeBoundaries((prev) => {
                            const next = [...prev];
                            next[idx] = { ...next[idx], descriptor: e.target.value };
                            return next;
                          });
                        }}
                        className="ml-auto w-32 rounded-lg border border-[#D4CFC7] bg-[#F5F1EB] px-2 py-1 text-right text-[#C4B5A6] focus:outline-none focus:ring-2 focus:ring-[#5F7A8A]/30"
                      />
                      <button
                        type="button"
                        onClick={() => removeGradeBoundary(idx)}
                        disabled={gradeBoundaries.length <= 1}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[#D4CFC7] text-[#6B6560] transition hover:bg-[#F9EAEA] hover:text-[#B86B6B] disabled:cursor-not-allowed disabled:opacity-40"
                        aria-label={`Delete grade boundary ${idx + 1}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addGradeBoundary}
                  className="w-full rounded-lg border border-dashed border-[#D4CFC7] py-2 text-sm text-[#6B6560] transition hover:border-[#5F7A8A] hover:text-[#5F7A8A]"
                >
                  + Add item
                </button>
              </div>
            </div>

            {/* Advanced: Boundary handling + rounding */}
            <div className="rounded-2xl border border-[#D4CFC7] bg-[#FCFAF7] px-4 py-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-[#3A3530]">Advanced</p>
              </div>

              <div className="mt-4 space-y-6">
                <div>
                  <p className="mb-2 text-sm font-semibold text-[#3A3530]">Boundary Handling</p>
                  <div className="space-y-2">
                    <label className="flex items-center gap-3 text-sm text-[#3A3530]">
                      <input
                        type="radio"
                        name="boundary"
                        checked={boundaryHandling === "round-up"}
                        onChange={() => setBoundaryHandling("round-up")}
                        className="h-4 w-4 accent-[#5F7A8A]"
                      />
                      79.5 counts as 80
                    </label>
                    <label className="flex items-center gap-3 text-sm text-[#3A3530]">
                      <input
                        type="radio"
                        name="boundary"
                        checked={boundaryHandling === "strict"}
                        onChange={() => setBoundaryHandling("strict")}
                        className="h-4 w-4 accent-[#5F7A8A]"
                      />
                      Strict boundaries (80.0 only)
                    </label>
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-sm font-semibold text-[#3A3530]">Rounding</p>
                  <div className="space-y-2">
                    <label className="flex items-center gap-3 text-sm text-[#3A3530]">
                      <input
                        type="radio"
                        name="rounding"
                        checked={rounding === "one-decimal"}
                        onChange={() => setRounding("one-decimal")}
                        className="h-4 w-4 accent-[#5F7A8A]"
                      />
                      Round final percentage to 1 decimal
                    </label>
                    <label className="flex items-center gap-3 text-sm text-[#3A3530]">
                      <input
                        type="radio"
                        name="rounding"
                        checked={rounding === "none"}
                        onChange={() => setRounding("none")}
                        className="h-4 w-4 accent-[#5F7A8A]"
                      />
                      No rounding
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* Errors */}
      {error ? <p className="mt-4 text-sm text-[#B86B6B]">{error}</p> : null}

      {/* Actions */}
      <button
        onClick={handleContinue}
        disabled={saving}
        className="mt-6 w-full rounded-xl bg-[#5F7A8A] py-4 font-medium text-white shadow-sm transition hover:bg-[#6B8BA8] disabled:opacity-60"
      >
        {saving ? "Saving..." : "Continue to Grades"}
      </button>
    </div>
  );
}
