import type {
  CourseAssessment,
  TargetCheckResponse,
  UniformRequiredAssessment,
} from "@/lib/api";

const CHILD_ASSESSMENT_SEPARATOR = "::";

export type AssessmentBreakdownRow = {
  key: string;
  name: string;
  rowType: "graded" | "ungraded";
  weight: number;
  weightLabel: string;
  neededLabel: string;
  needed: string;
  contrib: string;
  isMandatoryPass?: boolean;
  passThreshold?: number | null;
  passStatus?: "passed" | "failed" | "pending" | null;
  mandatoryWarning?: string | null;
  ungradedChildCount?: number;
  ruleSummary?: string | null;
};

export type AssessmentTarget = {
  key: string;
  assessmentName: string;
  displayName: string;
  weight: number;
  isBonus: boolean;
  percent: number | null;
  graded: boolean;
  partial: boolean;
  ungradedChildCount: number;
  isChild: boolean;
  isMandatoryPass: boolean;
  passThreshold: number | null;
  ruleType: string | null;
  ruleConfig: Record<string, unknown> | null;
  childCount: number;
};

export type AssessmentTargetGroup = {
  key: string;
  parent: AssessmentTarget;
  children: AssessmentTarget[];
};

export function resolveCurrentGrade(result: TargetCheckResponse | null): number {
  if (!result) return 0;
  return Number.isFinite(result.final_total)
    ? Number(result.final_total)
    : result.current_standing;
}

function hasGrade(assessment: CourseAssessment): boolean {
  const children = Array.isArray(assessment.children) ? assessment.children : [];
  if (children.length) {
    return children.every(
      (child) =>
        typeof child.raw_score === "number" &&
        typeof child.total_score === "number" &&
        child.total_score > 0
    );
  }

  return (
    typeof assessment.raw_score === "number" &&
    typeof assessment.total_score === "number" &&
    assessment.total_score > 0
  );
}

function isChildGraded(child: CourseAssessment): boolean {
  return (
    typeof child.raw_score === "number" &&
    typeof child.total_score === "number" &&
    child.total_score > 0
  );
}

function getPercent(assessment: CourseAssessment): number | null {
  const children = Array.isArray(assessment.children) ? assessment.children : [];
  if (children.length) {
    const gradedChildren = children.filter(isChildGraded);
    if (gradedChildren.length === 0) return null;

    const contribution = gradedChildren.reduce((sum, child) => {
      return sum + ((child.raw_score! / child.total_score!) * 100 * child.weight) / 100;
    }, 0);
    const effectiveWeight = children.reduce((sum, child) => sum + child.weight, 0);
    if (effectiveWeight <= 0) return null;
    return Math.max(0, Math.min((contribution / effectiveWeight) * 100, 100));
  }

  if (!hasGrade(assessment)) return null;
  const percent =
    ((assessment.raw_score as number) / (assessment.total_score as number)) *
    100;
  if (!Number.isFinite(percent)) return null;
  return Math.max(0, Math.min(percent, 100));
}

function getMandatoryPassThreshold(
  assessment: CourseAssessment
): number | null {
  if (assessment.rule_type !== "mandatory_pass") return null;
  const config = assessment.rule_config ?? {};
  const raw = (config as Record<string, unknown>).pass_threshold;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return 50;
  return Math.max(0, Math.min(parsed, 100));
}

function parsePositiveInteger(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const rounded = Math.floor(parsed);
  return rounded > 0 ? rounded : null;
}

export function buildAssessmentTargetGroups(
  assessments: CourseAssessment[]
): AssessmentTargetGroup[] {
  const targets: AssessmentTargetGroup[] = [];

  for (const assessment of assessments) {
    const children = Array.isArray(assessment.children) ? assessment.children : [];
    const isBonus = Boolean(assessment.is_bonus);
    const passThreshold = getMandatoryPassThreshold(assessment);
    const parentPercent = getPercent(assessment);
    const normalizedRuleConfig: Record<string, unknown> =
      assessment.rule_config && typeof assessment.rule_config === "object"
        ? { ...(assessment.rule_config as Record<string, unknown>) }
        : {};
    const totalCountFromAssessment = parsePositiveInteger(assessment.total_count);
    const effectiveCountFromAssessment = parsePositiveInteger(
      assessment.effective_count
    );
    if (
      totalCountFromAssessment &&
      !parsePositiveInteger(normalizedRuleConfig.total_count)
    ) {
      normalizedRuleConfig.total_count = totalCountFromAssessment;
    }
    if (assessment.rule_type === "best_of") {
      if (
        effectiveCountFromAssessment &&
        !parsePositiveInteger(normalizedRuleConfig.best_count)
      ) {
        normalizedRuleConfig.best_count = effectiveCountFromAssessment;
      }
    } else if (assessment.rule_type === "drop_lowest") {
      if (
        totalCountFromAssessment &&
        effectiveCountFromAssessment &&
        !parsePositiveInteger(normalizedRuleConfig.drop_count)
      ) {
        normalizedRuleConfig.drop_count = Math.max(
          1,
          totalCountFromAssessment - effectiveCountFromAssessment
        );
      }
    }

    const gradedChildCount = children.filter(isChildGraded).length;
    const isPartial =
      children.length > 0 &&
      gradedChildCount > 0 &&
      gradedChildCount < children.length;

    const ungradedChildCount = children.length - gradedChildCount;

    const parentTarget: AssessmentTarget = {
      key: assessment.name,
      assessmentName: assessment.name,
      displayName: assessment.name,
      weight: Number.isFinite(assessment.weight) ? assessment.weight : 0,
      isBonus,
      percent: parentPercent,
      graded: parentPercent !== null,
      partial: isPartial,
      ungradedChildCount: isPartial ? ungradedChildCount : 0,
      isChild: false,
      isMandatoryPass: passThreshold !== null,
      passThreshold,
      ruleType:
        typeof assessment.rule_type === "string" ? assessment.rule_type : null,
      ruleConfig: Object.keys(normalizedRuleConfig).length
        ? normalizedRuleConfig
        : null,
      childCount: children.length,
    };

    if (children.length) {
      const childTargets: AssessmentTarget[] = [];
      for (const child of children) {
        const childHasGrade = isChildGraded(child);
        const percent = childHasGrade
          ? Math.max(0, Math.min((child.raw_score! / child.total_score!) * 100, 100))
          : null;

        childTargets.push({
          key: `${assessment.name}${CHILD_ASSESSMENT_SEPARATOR}${child.name}`,
          assessmentName: `${assessment.name}${CHILD_ASSESSMENT_SEPARATOR}${child.name}`,
          displayName: `${assessment.name} — ${child.name}`,
          weight: Number.isFinite(child.weight) ? child.weight : 0,
          isBonus,
          percent,
          graded: childHasGrade,
          partial: false,
          ungradedChildCount: 0,
          isChild: true,
          isMandatoryPass: false,
          passThreshold: null,
          ruleType: null,
          ruleConfig: null,
          childCount: 0,
        });
      }
      targets.push({
        key: assessment.name,
        parent: parentTarget,
        children: childTargets,
      });
      continue;
    }

    targets.push({
      key: assessment.name,
      parent: {
        ...parentTarget,
        partial: false,
      },
      children: [],
    });
  }

  return targets;
}

function formatCompactNumber(value: number): string {
  if (!Number.isFinite(value)) return "0";
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(2).replace(/\.?0+$/, "");
}

function buildRuleSummary(assessment: AssessmentTarget): string | null {
  if (!assessment.childCount) return null;

  const config = assessment.ruleConfig ?? {};
  const totalCount =
    parsePositiveInteger((config as Record<string, unknown>).total_count) ??
    assessment.childCount;

  if (assessment.ruleType === "best_of") {
    const bestCount = parsePositiveInteger(
      (config as Record<string, unknown>).best_count
    );
    if (bestCount) {
      return `Best ${Math.min(bestCount, totalCount)} of ${totalCount} ${assessment.displayName}`;
    }
  }

  if (assessment.ruleType === "drop_lowest") {
    const dropCount =
      parsePositiveInteger((config as Record<string, unknown>).drop_count) ?? 1;
    return `Drop lowest ${Math.min(dropCount, totalCount)} of ${totalCount} ${assessment.displayName}`;
  }

  if (assessment.ruleType === "pure_multiplicative") {
    return `All ${totalCount} ${assessment.displayName} count`;
  }

  return `${assessment.childCount} ${assessment.displayName}`;
}

export function getDaysLeft(isoDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(isoDate);
  due.setHours(0, 0, 0, 0);
  return Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export function buildBreakdownRow(
  assessment: AssessmentTarget,
  uniformData: UniformRequiredAssessment | undefined,
): AssessmentBreakdownRow {
  const actualPercent = assessment.percent;
  const mandatoryPassStatus =
    assessment.isMandatoryPass && typeof assessment.passThreshold === "number"
      ? actualPercent === null
        ? "pending"
        : actualPercent >= assessment.passThreshold
          ? "passed"
          : "failed"
      : null;

  if (actualPercent !== null) {
    let contributionPoints = (actualPercent * assessment.weight) / 100;
    let displayPercent = actualPercent;
    if (
      !assessment.isChild &&
      uniformData &&
      Number.isFinite(uniformData.current_contribution)
    ) {
      contributionPoints = uniformData.current_contribution;
      if (assessment.weight > 0) {
        displayPercent = Math.max(
          0,
          Math.min((contributionPoints / assessment.weight) * 100, 100)
        );
      }
    }
    const label = assessment.partial ? "Earned So Far" : "Actual Performance";
    return {
      key: assessment.key,
      name: assessment.displayName,
      rowType: "graded",
      weight: assessment.weight,
      weightLabel: `${assessment.weight}% of final grade`,
      neededLabel: label,
      needed: `${displayPercent.toFixed(1)}% (${contributionPoints.toFixed(2)} / ${formatCompactNumber(
        assessment.weight
      )})`,
      contrib: `+${contributionPoints.toFixed(2)}%`,
      isMandatoryPass: assessment.isMandatoryPass,
      passThreshold: assessment.passThreshold,
      passStatus: mandatoryPassStatus,
      mandatoryWarning: null,
      ungradedChildCount: assessment.ungradedChildCount,
      ruleSummary: buildRuleSummary(assessment),
    };
  }

  if (uniformData) {
    const uniformPercent = uniformData.uniform_percent;
    const contributionPoints = (uniformPercent * assessment.weight) / 100;
    const isAchievable = uniformPercent <= 100;
    const passStatus = uniformData.pass_status ?? (assessment.isMandatoryPass ? "pending" : null);
    const mandatoryWarning =
      assessment.isMandatoryPass && uniformData.pass_threshold !== null && uniformPercent > 100
        ? `Target requires more than 100% — not achievable.`
        : null;

    return {
      key: assessment.key,
      name: assessment.displayName,
      rowType: "ungraded",
      weight: assessment.weight,
      weightLabel: `${assessment.weight}% of final grade`,
      neededLabel: isAchievable ? "Minimum Needed" : "Not Achievable",
      needed: isAchievable
        ? `${uniformPercent.toFixed(1)}% (${contributionPoints.toFixed(2)} / ${formatCompactNumber(assessment.weight)})`
        : "—",
      contrib: isAchievable ? `+${contributionPoints.toFixed(2)}%` : "—",
      isMandatoryPass: assessment.isMandatoryPass,
      passThreshold: assessment.passThreshold,
      passStatus: passStatus,
      mandatoryWarning: mandatoryWarning,
      ungradedChildCount: assessment.ungradedChildCount,
      ruleSummary: buildRuleSummary(assessment),
    };
  }

  return {
    key: assessment.key,
    name: assessment.displayName,
    rowType: "ungraded",
    weight: assessment.weight,
    weightLabel: `${assessment.weight}% of final grade`,
    neededLabel: "Not Yet Calculated",
    needed: "—",
    contrib: "—",
    isMandatoryPass: assessment.isMandatoryPass,
    passThreshold: assessment.passThreshold,
    passStatus: assessment.isMandatoryPass ? "pending" : null,
    mandatoryWarning: null,
    ungradedChildCount: assessment.ungradedChildCount,
    ruleSummary: buildRuleSummary(assessment),
  };
}

export function normalizeTermKey(term?: string | null): string {
  return (term ?? "").trim().toLowerCase();
}
