from fastapi import FastAPI, HTTPException, Depends
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
    calculate_risk_ranges, calculate_final_grade, get_assessment_status
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
