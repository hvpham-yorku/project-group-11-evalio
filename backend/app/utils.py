from typing import Dict, List
import re
import io
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

def extract_text_from_file(filename: str, content: bytes) -> str:
    """Extract text from uploaded file (PDF, DOCX, TXT)"""
    ext = filename.lower().rsplit(".", 1)[-1] if "." in filename else ""
    
    if ext == "pdf":
        try:
            from PyPDF2 import PdfReader
            reader = PdfReader(io.BytesIO(content))
            text = ""
            for page in reader.pages:
                text += page.extract_text() or ""
            return text.strip()
        except Exception as e:
            raise ValueError(f"Failed to parse PDF: {str(e)}")
    
    elif ext in ("doc", "docx"):
        try:
            from docx import Document
            doc = Document(io.BytesIO(content))
            text = "\n".join([p.text for p in doc.paragraphs])
            return text.strip()
        except Exception as e:
            raise ValueError(f"Failed to parse Word document: {str(e)}")
    
    elif ext == "txt":
        return content.decode("utf-8", errors="ignore").strip()
    
    else:
        raise ValueError(f"Unsupported file type: .{ext}. Use PDF, Word, or TXT.")

def parse_syllabus_text(text: str) -> List[Dict]:
    """Parse syllabus text to extract assessment components and weights"""
    assessments = []
    
    # Common patterns for grading breakdowns
    # Pattern: "Assignment Name ... 20%" or "Assignment Name (20%)" or "Assignment Name: 20%"
    patterns = [
        # "Midterm Exam 25%" or "Midterm Exam: 25%" or "Midterm Exam - 25%"  
        r'([A-Za-z][A-Za-z\s/&\-\(\)]+?)[\s:.\-–—]+(\d{1,3})(?:\.\d+)?\s*%',
        # "25% Midterm Exam"
        r'(\d{1,3})(?:\.\d+)?\s*%\s*[\-–—:.]?\s*([A-Za-z][A-Za-z\s/&\-\(\)]+)',
    ]
    
    found = []
    
    for pattern in patterns:
        matches = re.findall(pattern, text, re.MULTILINE | re.IGNORECASE)
        for match in matches:
            if pattern == patterns[0]:
                name, weight = match
            else:
                weight, name = match
            
            name = name.strip().strip(":-–—. ")
            weight_val = float(weight)
            
            # Filter out noise
            if weight_val < 1 or weight_val > 100:
                continue
            if len(name) < 2 or len(name) > 60:
                continue
            # Skip common false positives
            skip_words = ["total", "grade", "final grade", "overall", "passing", "minimum", "maximum", "page", "course"]
            if name.lower().strip() in skip_words:
                continue
            
            # Avoid duplicates
            if not any(f["name"].lower() == name.lower() for f in found):
                found.append({
                    "name": name,
                    "weight": round(weight_val / 100, 4)
                })
    
    # Sort by weight descending
    found.sort(key=lambda x: x["weight"], reverse=True)
    
    # If nothing found, return some defaults as guidance
    if not found:
        found = [
            {"name": "Midterm Exam", "weight": 0.25},
            {"name": "Final Exam", "weight": 0.35},
            {"name": "Assignments", "weight": 0.20},
            {"name": "Participation", "weight": 0.10},
            {"name": "Project", "weight": 0.10},
        ]
    
    return found
