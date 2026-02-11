from fastapi import FastAPI, HTTPException, Depends, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from app.config import engine, Base, get_db
from app.models import Course, Assessment, Scenario
from app.schemas import (
    CourseCreate, CourseResponse, CourseUpdate,
    AssessmentCreate, AssessmentResponse,
    AnalyzeRequest, AnalyzeResponse, RiskRange,
    SimulateRequest, SimulateResponse
)
from app.utils import (
    calculate_current_average, calculate_required_score,
    calculate_risk_ranges, calculate_final_grade, get_assessment_status,
    parse_syllabus_text, extract_text_from_file
)

# Create tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Evalio API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:8000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Health Check
@app.get("/health")
def health():
    return {"status": "ok"}

# ============ COURSE ENDPOINTS ============

@app.get("/courses", response_model=list[CourseResponse])
def list_courses(db: Session = Depends(get_db)):
    """List all courses"""
    courses = db.query(Course).all()
    return courses

@app.post("/courses", response_model=CourseResponse)
def create_course(course: CourseCreate, db: Session = Depends(get_db)):
    """Create a new course"""
    db_course = Course(name=course.name, target_grade=course.target_grade)
    db.add(db_course)
    db.commit()
    db.refresh(db_course)
    return db_course

@app.get("/courses/{course_id}", response_model=CourseResponse)
def get_course(course_id: int, db: Session = Depends(get_db)):
    """Get course details with assessments"""
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    return course

@app.put("/courses/{course_id}", response_model=CourseResponse)
def update_course(course_id: int, course: CourseUpdate, db: Session = Depends(get_db)):
    """Update course details"""
    db_course = db.query(Course).filter(Course.id == course_id).first()
    if not db_course:
        raise HTTPException(status_code=404, detail="Course not found")
    
    if course.name:
        db_course.name = course.name
    if course.target_grade:
        db_course.target_grade = course.target_grade
    
    db.commit()
    db.refresh(db_course)
    return db_course

@app.delete("/courses/{course_id}")
def delete_course(course_id: int, db: Session = Depends(get_db)):
    """Delete a course"""
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    
    db.delete(course)
    db.commit()
    return {"message": "Course deleted"}

# ============ ASSESSMENT ENDPOINTS ============

@app.post("/courses/{course_id}/assessments", response_model=AssessmentResponse)
def create_assessment(course_id: int, assessment: AssessmentCreate, db: Session = Depends(get_db)):
    """Add assessment to course"""
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    
    # Validate weights sum to <= 1.0
    total_weight = sum(a.weight for a in course.assessments) + assessment.weight
    if total_weight > 1.0:
        raise HTTPException(status_code=400, detail="Total weights cannot exceed 100%")
    
    db_assessment = Assessment(
        course_id=course_id,
        name=assessment.name,
        weight=assessment.weight,
        current_score=assessment.current_score,
        due_date=assessment.due_date
    )
    db.add(db_assessment)
    db.commit()
    db.refresh(db_assessment)
    return db_assessment

@app.put("/assessments/{assessment_id}", response_model=AssessmentResponse)
def update_assessment(assessment_id: int, assessment: AssessmentCreate, db: Session = Depends(get_db)):
    """Update assessment"""
    db_assessment = db.query(Assessment).filter(Assessment.id == assessment_id).first()
    if not db_assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")
    
    db_assessment.name = assessment.name
    db_assessment.weight = assessment.weight
    db_assessment.current_score = assessment.current_score
    db_assessment.due_date = assessment.due_date
    
    db.commit()
    db.refresh(db_assessment)
    return db_assessment

@app.delete("/assessments/{assessment_id}")
def delete_assessment(assessment_id: int, db: Session = Depends(get_db)):
    """Delete assessment"""
    assessment = db.query(Assessment).filter(Assessment.id == assessment_id).first()
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")
    
    db.delete(assessment)
    db.commit()
    return {"message": "Assessment deleted"}

# ============ ANALYSIS ENDPOINTS ============

@app.post("/courses/{course_id}/analyze", response_model=AnalyzeResponse)
def analyze_feasibility(course_id: int, data: AnalyzeRequest, db: Session = Depends(get_db)):
    """Calculate feasibility analysis (required scores, risk ranges)"""
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    
    assessments = course.assessments
    
    # Update current scores from request
    for assessment in assessments:
        if assessment.name in data.current_scores:
            assessment.current_score = data.current_scores[assessment.name]
    
    current_avg = calculate_current_average(assessments)
    required_score = calculate_required_score(assessments, course.target_grade)
    risk_ranges = calculate_risk_ranges(required_score)
    is_achievable = required_score <= 100.0
    
    # Get completed assessments info
    completed = {a.name: a.current_score for a in assessments if a.current_score is not None}
    
    return AnalyzeResponse(
        required_score=round(required_score, 1),
        is_achievable=is_achievable,
        current_average=round(current_avg, 1),
        target_grade=course.target_grade,
        risk_ranges=RiskRange(**{k: round(v, 1) for k, v in risk_ranges.items()}),
        completed_assessments=completed
    )

@app.post("/courses/{course_id}/simulate", response_model=SimulateResponse)
def simulate_scenario(course_id: int, data: SimulateRequest, db: Session = Depends(get_db)):
    """Simulate what-if scenario with hypothetical scores"""
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    
    assessments = course.assessments
    
    # Create a copy with hypothetical scores
    simulated_scores = {}
    for assessment in assessments:
        score = data.hypothetical_scores.get(assessment.name) or assessment.current_score
        simulated_scores[assessment.name] = score
    
    final_grade = calculate_final_grade(assessments, simulated_scores)
    status = get_assessment_status(final_grade, course.target_grade)
    
    # Save scenario to DB
    scenario = Scenario(
        course_id=course_id,
        test_input=data.hypothetical_scores,
        projected_final_grade=final_grade
    )
    db.add(scenario)
    db.commit()
    
    return SimulateResponse(
        projected_final_grade=final_grade,
        breakdown=simulated_scores,
        status=status
    )

# ============ FILE UPLOAD / SYLLABUS PARSING ============

@app.post("/upload-syllabus")
async def upload_syllabus(file: UploadFile = File(...)):
    """Upload a syllabus file and extract grading structure"""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")
    
    content = await file.read()
    
    try:
        text = extract_text_from_file(file.filename, content)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    
    assessments = parse_syllabus_text(text)
    
    # Extract course name from filename
    course_name = file.filename.rsplit(".", 1)[0].replace("_", " ").replace("-", " ").title()
    
    return {
        "course_name": course_name,
        "extracted_text_preview": text[:500],
        "assessments": assessments,
        "total_weight": round(sum(a["weight"] for a in assessments), 2)
    }

@app.post("/courses/{course_id}/assessments/batch")
def create_assessments_batch(
    course_id: int,
    assessments: list[AssessmentCreate],
    db: Session = Depends(get_db)
):
    """Create multiple assessments at once"""
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    
    total_weight = sum(a.weight for a in course.assessments) + sum(a.weight for a in assessments)
    if total_weight > 1.01:  # small epsilon for float rounding
        raise HTTPException(status_code=400, detail=f"Total weights ({total_weight:.0%}) exceed 100%")
    
    created = []
    for assessment in assessments:
        db_assessment = Assessment(
            course_id=course_id,
            name=assessment.name,
            weight=assessment.weight,
            current_score=assessment.current_score,
            due_date=assessment.due_date
        )
        db.add(db_assessment)
        created.append(db_assessment)
    
    db.commit()
    for a in created:
        db.refresh(a)
    
    return [{"id": a.id, "name": a.name, "weight": a.weight} for a in created]

# ============ GPA CONVERSION ============

@app.post("/gpa/convert")
def convert_gpa(data: dict):
    """Convert between GPA scales"""
    value = data.get("value", 0)
    from_scale = data.get("from_scale", "percentage")
    
    # Convert everything to percentage first
    if from_scale == "percentage":
        pct = value
    elif from_scale == "4.0":
        pct = (value / 4.0) * 100
    elif from_scale == "9.0":
        pct = (value / 9.0) * 100
    elif from_scale == "10.0":
        pct = (value / 10.0) * 100
    else:
        pct = value
    
    pct = max(0, min(100, pct))
    
    # Letter grade
    if pct >= 90: letter = "A+"
    elif pct >= 85: letter = "A"
    elif pct >= 80: letter = "A-"
    elif pct >= 77: letter = "B+"
    elif pct >= 73: letter = "B"
    elif pct >= 70: letter = "B-"
    elif pct >= 67: letter = "C+"
    elif pct >= 63: letter = "C"
    elif pct >= 60: letter = "C-"
    elif pct >= 57: letter = "D+"
    elif pct >= 53: letter = "D"
    elif pct >= 50: letter = "D-"
    else: letter = "F"
    
    return {
        "percentage": round(pct, 1),
        "gpa_4": round(pct / 100 * 4, 2),
        "gpa_9": round(pct / 100 * 9, 2),
        "gpa_10": round(pct / 100 * 10, 2),
        "letter": letter
    }
