from typing import Dict, List
from app.models import Assessment

def calculate_current_average(assessments: List[Assessment]) -> float:
    """Calculate weighted average of graded assessments"""
    total_weight = 0
    total_score = 0
    
    for assessment in assessments:
        if assessment.current_score is not None:
            total_weight += assessment.weight
            total_score += assessment.current_score * assessment.weight
    
    if total_weight == 0:
        return 0.0
    
    return total_score / total_weight

def calculate_required_score(assessments: List[Assessment], target_grade: float) -> float:
    """Calculate minimum score needed on remaining assessments to reach target"""
    # Calculate weighted average of completed assessments
    completed_weight = 0
    completed_score = 0
    remaining_weight = 0
    
    for assessment in assessments:
        if assessment.current_score is not None:
            completed_weight += assessment.weight
            completed_score += assessment.current_score * assessment.weight
        else:
            remaining_weight += assessment.weight
    
    if remaining_weight == 0:
        return 100.0  # All assessments graded
    
    # Solve: (completed_score + x * remaining_weight) / 1.0 = target_grade
    # x = (target_grade - completed_score) / remaining_weight
    required = (target_grade - completed_score) / remaining_weight
    
    return max(0.0, min(100.0, required))

def calculate_risk_ranges(required_score: float) -> Dict[str, float]:
    """Calculate min/safe/stretch score ranges"""
    return {
        "minimum": required_score,
        "safe": min(100.0, required_score + 3),
        "stretch": min(100.0, required_score + 8)
    }

def calculate_final_grade(assessments: List[Assessment], hypothetical: Dict[str, float] = None) -> float:
    """Calculate final grade with optional hypothetical scores"""
    total = 0.0
    
    for assessment in assessments:
        score = hypothetical.get(assessment.name) if hypothetical else assessment.current_score
        if score is not None:
            total += score * assessment.weight
    
    return round(total, 1)

def get_assessment_status(final_grade: float, target_grade: float) -> str:
    """Determine if on track, above, or below target"""
    if final_grade >= target_grade:
        return "above"
    elif final_grade >= target_grade - 5:
        return "on_track"
    else:
        return "below"
