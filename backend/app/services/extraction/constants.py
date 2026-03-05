from __future__ import annotations

import re

PERCENTAGE_REGEX = re.compile(r"(?<!\d)(100(?:\.0+)?|[1-9]?\d(?:\.\d+)?)\s*%")
SECTION_KEYWORDS = (
    "grading",
    "evaluation",
    "assessment",
    "breakdown",
    "weight",
    "worth",
    "distribution",
    "%",
)
PENALTY_KEYWORDS = ("late penalty", "deduct", "penalty", "per day late")
RULE_PATTERNS = (
    re.compile(r"\bbest\s+\d+\s+of\s+\d+\b", re.IGNORECASE),
    re.compile(r"\bdrop\s+lowest\b", re.IGNORECASE),
    re.compile(r"\bmust\s+pass\b", re.IGNORECASE),
    re.compile(r"\bbonus\b", re.IGNORECASE),
)
ASSESSMENT_KEYWORDS = {
    "quiz",
    "quizzes",
    "test",
    "term test",
    "lab test",
    "assignment",
    "midterm",
    "final",
    "project",
    "presentation",
    "participation",
    "activity",
    "report",
    "viva",
}
ASSESSMENT_WHITELIST_KEYWORDS = (
    "assignment",
    "quiz",
    "quizzes",
    "test",
    "midterm",
    "final",
    "exam",
    "lab",
    "tutorial",
    "participation",
    "project",
    "presentation",
    "essay",
    "report",
    "homework",
    "deliverable",
)
ASSESSMENT_SHORTFORM_REGEX = re.compile(r"\b(?:a\d+|hw\d+|q\d+|quiz\s*\d+)\b", re.IGNORECASE)
EXAM_TERMS = ("exam", "examination")
EXAM_ACCEPTED_START_TOKENS = ("final", "midterm", "practice", "quiz", "lab", "test", "exam", "examination")
EXAM_ADMIN_VERBS = (
    "must",
    "required",
    "requirement",
    "may",
    "vary",
    "contributes",
    "include",
    "subject to",
    "discretion",
    "obtain",
    "achieve",
)
EXAM_ADMIN_NOUNS = (
    "logistics",
    "format",
    "formatting",
    "attendance",
    "integrity",
    "compliance",
    "guideline",
    "policy",
    "department",
    "administrative",
)
POLICY_BLACKLIST_PHRASES = (
    "policy",
    "policies",
    "guideline",
    "guidelines",
    "compliance",
    "integrity",
    "department",
    "academic integrity",
    "must",
    "required",
    "must obtain",
    "must achieve",
    "required to",
    "requirement",
    "to pass",
    "pass the course",
    "pass this course",
    "minimum",
    "threshold",
    "at least",
    "overall",
    "in order to",
    "mandatory",
    "may vary",
    "discretion",
    "subject to change",
    "contributes",
    "late penalty",
    "deduct",
    "per day",
    "penalized",
    "penalty",
)
MONTH_DATE_REGEX = re.compile(
    r"\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|"
    r"jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)"
    r"\s+\d{1,2}(?:,\s*\d{4})?\b",
    re.IGNORECASE,
)
NUMERIC_DATE_REGEX = re.compile(r"\b(?:\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b")
TIME_REGEX = re.compile(
    r"(?:\b(?:[01]?\d|2[0-3]):[0-5]\d(?:\s?(?:am|pm))?\b)|"
    r"(?:\b(?:1[0-2]|0?[1-9])\s?(?:am|pm)\b)",
    re.IGNORECASE,
)
TERM_REGEX = re.compile(r"^\s*([WFS])\s*([0-9]{2}|[0-9]{4})\s*$", re.IGNORECASE)
TOKEN_REGEX = re.compile(r"[a-z0-9]+")
WEIGHT_NUMBER_REGEX = re.compile(r"[-+]?\d*\.?\d+")
WEIGHT_MARKS_UNIT_REGEX = re.compile(r"\b(?:marks?|pts?|points?)\b", re.IGNORECASE)
WEIGHT_PERCENT_UNIT_REGEX = re.compile(r"%")
BEST_OF_REGEX = re.compile(r"best\s+(\d+)\s+(?:(?:out\s+of|of)\s+)?(\d+)", re.IGNORECASE)
EACH_PERCENT_REGEX = re.compile(r"each.*?(\d+(?:\.\d+)?)\s*%", re.IGNORECASE)
LEADING_COUNT_REGEX = re.compile(r"^(\d+)\s+(.*)")
DROP_LOWEST_RULE_REGEX = re.compile(r"\bdrop\s+lowest(?:\s+(\d+))?\b", re.IGNORECASE)
DROP_LOWEST_ALT_RULE_REGEX = re.compile(r"\bdrop\s+(\d+)\s+lowest\b", re.IGNORECASE)
TOTAL_COUNT_REGEX = re.compile(r"\b(?:out\s+of|of)\s+(\d+)\b", re.IGNORECASE)
COURSE_CODE_REGEX = re.compile(r"\b[A-Z]{2,6}\s?-?\s?\d{3,4}[A-Z]?\b")
COURSE_CODE_ALT_REGEX = re.compile(r"\b[A-Z]{2,6}\s?-?\s?\d[A-Z]\d{2}\b")
FILENAME_COURSE_CODE_REGEX = re.compile(r"(?<![A-Z0-9])([A-Z]{1,6})[\s-]?(\d{4})(?![A-Z0-9])")
PHONE_NUMBER_REGEX = re.compile(
    r"\b(?:\+?\d{1,2}[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}\b"
)
COURSE_CODE_BLOCK_TOKENS = ("ROOM", "PAGE", "DATE", "TIME", "OFFICE", "INSTRUCTOR")

MAX_TEXT_CHARS = 120000
MAX_SCAN_LINES = 2000
MAX_OCR_PAGES = 10
PDF_SUSPICIOUS_TEXT_THRESHOLD = 400
