from __future__ import annotations

import re

from app.services.extraction.constants import (
    ASSESSMENT_SHORTFORM_REGEX,
    ASSESSMENT_WHITELIST_KEYWORDS,
    EXAM_ACCEPTED_START_TOKENS,
    EXAM_ADMIN_NOUNS,
    EXAM_ADMIN_VERBS,
    EXAM_TERMS,
    POLICY_BLACKLIST_PHRASES,
)


class HeuristicsMixin:
    def _has_assessment_keyword(self, text: str) -> bool:
        lowered = text.lower()
        whitelist_hit = any(
            re.search(rf"\b{re.escape(keyword)}\b", lowered)
            for keyword in ASSESSMENT_WHITELIST_KEYWORDS
        )
        shortform_hit = ASSESSMENT_SHORTFORM_REGEX.search(lowered) is not None
        return whitelist_hit or shortform_hit

    def _has_policy_blacklist(self, line_text: str) -> bool:
        lowered = line_text.lower()
        if any(phrase in lowered for phrase in POLICY_BLACKLIST_PHRASES):
            return True

        tokens = re.findall(r"[a-z]+", lowered)
        attendance_positions = [idx for idx, token in enumerate(tokens) if token == "attendance"]
        policy_required_positions = [
            idx for idx, token in enumerate(tokens) if token in {"policy", "required"}
        ]
        return any(
            abs(attendance_idx - policy_idx) <= 4
            for attendance_idx in attendance_positions
            for policy_idx in policy_required_positions
        )

    def _contains_exam_term(self, line_text: str) -> bool:
        lowered = line_text.lower()
        return any(re.search(rf"\b{re.escape(term)}\b", lowered) for term in EXAM_TERMS)

    def _is_exam_assessment_shaped(self, line_text: str) -> bool:
        lowered = line_text.lower()
        compact = re.sub(r"[^a-z0-9\s-]", " ", lowered)
        tokens = [token for token in re.split(r"\s+", compact) if token]
        if not tokens:
            return False

        if tokens[0] not in EXAM_ACCEPTED_START_TOKENS:
            return False

        first_five = tokens[:5]
        if any(token in EXAM_ADMIN_VERBS for token in first_five):
            return False
        if any(token in EXAM_ADMIN_NOUNS for token in first_five):
            return False

        return True

    def _is_likely_assessment_line(self, line_text: str) -> bool:
        if self._has_policy_blacklist(line_text):
            return False

        if self._has_assessment_keyword(line_text):
            if self._contains_exam_term(line_text):
                return self._is_exam_assessment_shaped(line_text)
            return True

        return False
