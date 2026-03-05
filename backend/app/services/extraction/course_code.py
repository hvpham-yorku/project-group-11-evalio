from __future__ import annotations

from app.services.extraction.constants import (
    COURSE_CODE_ALT_REGEX,
    COURSE_CODE_BLOCK_TOKENS,
    COURSE_CODE_REGEX,
    FILENAME_COURSE_CODE_REGEX,
    PHONE_NUMBER_REGEX,
)


def _is_mostly_uppercase(line: str) -> bool:
    letters = [char for char in line if char.isalpha()]
    if not letters:
        return False
    uppercase_count = sum(1 for char in letters if char.isupper())
    return (uppercase_count / len(letters)) >= 0.6


def _normalize_course_code(candidate: str) -> str:
    import re

    normalized = re.sub(r"\s+", " ", candidate.strip())
    return re.sub(r"\s*-\s*", "-", normalized)


def extract_course_code(full_text: str) -> str | None:
    lines = full_text.splitlines()[:80]
    best_candidate: str | None = None
    best_score = -1

    for index, raw_line in enumerate(lines):
        line = raw_line.strip()
        if not line:
            continue

        upper_line = line.upper()
        lower_line = line.lower()
        if any(token in upper_line for token in COURSE_CODE_BLOCK_TOKENS):
            continue
        if "@" in line or "http" in lower_line:
            continue
        if PHONE_NUMBER_REGEX.search(line):
            continue

        matches = [*COURSE_CODE_REGEX.findall(line), *COURSE_CODE_ALT_REGEX.findall(line)]
        if not matches:
            continue

        for match in matches:
            score = 0
            if index < 30:
                score += 2
            if "course" in lower_line:
                score += 1
            if len(line) < 120:
                score += 1
            if _is_mostly_uppercase(line):
                score += 1

            if score > best_score:
                best_score = score
                best_candidate = _normalize_course_code(match)

    return best_candidate


def extract_course_code_from_filename(filename: str) -> str | None:
    candidate = filename.upper()
    match = FILENAME_COURSE_CODE_REGEX.search(candidate)
    if match is None:
        return None
    return f"{match.group(1)}{match.group(2)}"
