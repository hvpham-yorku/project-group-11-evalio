from __future__ import annotations

import re
from datetime import UTC, date, datetime
from typing import Any

from app.models_extraction import ExtractionAssessment, ExtractionDeadline
from app.services.extraction.constants import (
    ASSESSMENT_SHORTFORM_REGEX,
    MAX_SCAN_LINES,
    MAX_TEXT_CHARS,
    MONTH_DATE_REGEX,
    NUMERIC_DATE_REGEX,
    PENALTY_KEYWORDS,
    PERCENTAGE_REGEX,
    RULE_PATTERNS,
    SECTION_KEYWORDS,
    TERM_REGEX,
    TIME_REGEX,
)


class DeterministicMixin:
    def _detect_grading_section(self, full_text: str) -> dict[str, Any]:
        lines = self._bounded_lines(full_text)
        if not lines:
            return {"lines": []}

        best_score = 0
        best_index = 0
        for idx in range(len(lines)):
            start = max(0, idx - 3)
            end = min(len(lines), idx + 4)
            window = " ".join(lines[start:end]).lower()
            score = sum(window.count(keyword) for keyword in SECTION_KEYWORDS)
            if score > best_score:
                best_score = score
                best_index = idx

        if best_score == 0:
            return {"lines": lines[:120]}

        start = max(0, best_index - 20)
        end = min(len(lines), best_index + 60)
        return {"lines": lines[start:end]}

    def _extract_percentages(self, lines: list[str]) -> dict[str, Any]:
        entries: list[dict[str, Any]] = []
        for line_idx, line in enumerate(lines):
            for match in PERCENTAGE_REGEX.finditer(line):
                value = float(match.group(1))
                lowered_line = line.lower()
                entries.append(
                    {
                        "line_idx": line_idx,
                        "line": line,
                        "match_start": match.start(),
                        "value": value,
                        "is_bonus": bool("bonus" in lowered_line),
                        "is_penalty_context": any(
                            keyword in lowered_line for keyword in PENALTY_KEYWORDS
                        ),
                    }
                )

        filtered = [entry for entry in entries if not entry["is_penalty_context"]]
        return {
            "all_entries": entries,
            "filtered_entries": filtered,
            "filtered_count": len(filtered),
            "all_count": len(entries),
        }

    def _cluster_assessments(
        self,
        *,
        lines: list[str],
        percentage_entries: list[dict[str, Any]],
    ) -> dict[str, Any]:
        assessment_entries: list[dict[str, Any]] = []
        linked_percentages = 0
        orphan_percentages = 0
        linked_non_bonus_percentages = 0
        orphan_non_bonus_percentages = 0
        dropped_by_gating_count = 0
        policy_filtered_count = 0
        assessment_keyword_hits = 0

        for entry in percentage_entries:
            context_result = self._extract_name_from_context(
                lines=lines,
                line_idx=entry["line_idx"],
                match_start=entry["match_start"],
            )
            name = context_result["name"]
            candidate_line = context_result["candidate_line"]
            if not name:
                orphan_percentages += 1
                if not entry.get("is_bonus", False):
                    orphan_non_bonus_percentages += 1
                continue

            if not self._is_likely_assessment_line(candidate_line):
                dropped_by_gating_count += 1
                orphan_percentages += 1
                if not entry.get("is_bonus", False):
                    orphan_non_bonus_percentages += 1
                if self._has_policy_blacklist(candidate_line):
                    policy_filtered_count += 1
                continue

            linked_percentages += 1
            if not entry.get("is_bonus", False):
                linked_non_bonus_percentages += 1
            line = lines[entry["line_idx"]]
            rules = [pattern.search(line) for pattern in RULE_PATTERNS]
            matched_rule = next((item.group(0) for item in rules if item), None)
            normalized_name = self._normalize_assessment_name(name)
            accepted_by_keyword = self._has_assessment_keyword(name) or self._has_assessment_keyword(
                candidate_line
            )
            assessment_entries.append(
                {
                    "name": name,
                    "weight": entry["value"],
                    "is_bonus": entry["is_bonus"],
                    "children": [],
                    "rule": matched_rule,
                    "notes": None,
                    "line_idx": entry["line_idx"],
                    "normalized_name": normalized_name,
                    "accepted_by_keyword": accepted_by_keyword,
                }
            )
            if accepted_by_keyword:
                assessment_keyword_hits += 1

        return {
            "assessments": [
                ExtractionAssessment(
                    name=item["name"],
                    weight=item["weight"],
                    is_bonus=item["is_bonus"],
                    children=[],
                    rule=item["rule"],
                    notes=item["notes"],
                )
                for item in assessment_entries
            ],
            "assessment_entries": assessment_entries,
            "linked_percentages": linked_percentages,
            "orphan_percentages": orphan_percentages,
            "linked_non_bonus_percentages": linked_non_bonus_percentages,
            "orphan_non_bonus_percentages": orphan_non_bonus_percentages,
            "dropped_by_gating_count": dropped_by_gating_count,
            "policy_filtered_count": policy_filtered_count,
            "assessment_keyword_hits": assessment_keyword_hits,
        }

    def _extract_name_from_context(
        self,
        *,
        lines: list[str],
        line_idx: int,
        match_start: int,
    ) -> dict[str, str | None]:
        current_line = lines[line_idx]
        prefix = current_line[:match_start].strip(" -:\t")
        cleaned_prefix = self._clean_assessment_name(prefix)
        if cleaned_prefix:
            return {"name": cleaned_prefix, "candidate_line": current_line}

        for offset in (1, 2):
            previous_index = line_idx - offset
            if previous_index < 0:
                break
            previous_line = lines[previous_index].strip(" -:\t")
            candidate = self._clean_assessment_name(previous_line)
            if candidate:
                return {"name": candidate, "candidate_line": lines[previous_index]}

        return {"name": None, "candidate_line": current_line}

    def _clean_assessment_name(self, text: str) -> str | None:
        stripped = re.sub(r"\s+", " ", text).strip(" -:\t")
        stripped = PERCENTAGE_REGEX.sub("", stripped).strip(" -:\t")
        shortform_match = ASSESSMENT_SHORTFORM_REGEX.fullmatch(stripped.lower()) is not None
        if (len(stripped) < 3 and not shortform_match) or len(stripped) > 50:
            return None
        if sum(1 for char in stripped if char.isalpha()) < 2 and not shortform_match:
            return None
        return stripped

    def _normalize_assessment_name(self, name: str) -> str:
        return re.sub(r"\s+", " ", name.lower()).strip()

    def _extract_deadlines(
        self,
        *,
        lines: list[str],
        assessment_entries: list[dict[str, Any]],
        term: str | None,
    ) -> dict[str, Any]:
        term_window = self._parse_term_window(term)
        candidate_dates: list[dict[str, Any]] = []
        valid_date_count = 0

        for line_idx, line in enumerate(lines):
            raw_dates = [*MONTH_DATE_REGEX.findall(line), *NUMERIC_DATE_REGEX.findall(line)]
            if not raw_dates:
                continue
            for date_text in raw_dates:
                parsed = self._parse_date(date_text=date_text, term_window=term_window)
                if parsed is None:
                    continue
                valid_date_count += 1
                time_match = TIME_REGEX.search(line)
                candidate_dates.append(
                    {
                        "line_idx": line_idx,
                        "line": line,
                        "date": parsed,
                        "due_time": time_match.group(0) if time_match else None,
                    }
                )

        return self._attach_deadlines(
            candidate_dates=candidate_dates,
            assessment_entries=assessment_entries,
            term_window=term_window,
            valid_date_count=valid_date_count,
        )

    def _attach_deadlines(
        self,
        *,
        candidate_dates: list[dict[str, Any]],
        assessment_entries: list[dict[str, Any]],
        term_window: dict[str, date] | None,
        valid_date_count: int,
    ) -> dict[str, Any]:
        deadlines: list[ExtractionDeadline] = []
        attached_count = 0
        within_window_count = 0
        attached_non_bonus_count = 0
        within_window_non_bonus_count = 0
        seen: set[tuple[str, str, str | None]] = set()
        now = datetime.now(UTC).date()

        for candidate in candidate_dates:
            matched_assessment = self._match_deadline_to_assessment(
                line_idx=candidate["line_idx"],
                line=candidate["line"],
                assessment_entries=assessment_entries,
            )
            if matched_assessment is None:
                continue
            attached_count += 1
            if not matched_assessment.get("is_bonus", False):
                attached_non_bonus_count += 1

            deadline_date: date = candidate["date"]
            if term_window is not None:
                if not (term_window["start"] <= deadline_date <= term_window["end"]):
                    continue
                within_window_count += 1
                if not matched_assessment.get("is_bonus", False):
                    within_window_non_bonus_count += 1
            else:
                if deadline_date.year < now.year - 1 or deadline_date.year > now.year + 1:
                    continue
                within_window_count += 1
                if not matched_assessment.get("is_bonus", False):
                    within_window_non_bonus_count += 1

            due_time = candidate["due_time"]
            dedupe_key = (
                matched_assessment["name"],
                deadline_date.isoformat(),
                due_time,
            )
            if dedupe_key in seen:
                continue
            seen.add(dedupe_key)
            deadlines.append(
                ExtractionDeadline(
                    title=matched_assessment["name"],
                    due_date=deadline_date.isoformat(),
                    due_time=due_time,
                    source="outline",
                    notes=None,
                )
            )

        return {
            "deadlines": deadlines,
            "valid_date_count": valid_date_count,
            "attached_count": attached_count,
            "within_window_count": within_window_count,
            "attached_non_bonus_count": attached_non_bonus_count,
            "within_window_non_bonus_count": within_window_non_bonus_count,
        }

    def _match_deadline_to_assessment(
        self,
        *,
        line_idx: int,
        line: str,
        assessment_entries: list[dict[str, Any]],
    ) -> dict[str, Any] | None:
        lowered_line = line.lower()
        for assessment in assessment_entries:
            if assessment["name"].lower() in lowered_line:
                return assessment

        nearest: dict[str, Any] | None = None
        nearest_distance = 4
        for assessment in assessment_entries:
            distance = abs(assessment["line_idx"] - line_idx)
            if distance <= 3 and distance < nearest_distance:
                nearest = assessment
                nearest_distance = distance
        return nearest

    def _parse_date(self, *, date_text: str, term_window: dict[str, date] | None) -> date | None:
        has_explicit_year = bool(re.search(r"\b\d{4}\b", date_text)) or bool(
            re.search(r"\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b", date_text)
        )

        if not has_explicit_year:
            if term_window is None:
                return None
            date_text = f"{date_text} {term_window['year']}"

        try:
            from dateutil import parser as date_parser
        except ImportError:
            return self._parse_date_with_strptime(date_text)

        try:
            parsed_datetime = date_parser.parse(date_text, fuzzy=False, dayfirst=False)
            return parsed_datetime.date()
        except (ValueError, OverflowError):
            return self._parse_date_with_strptime(date_text)

    def _parse_date_with_strptime(self, date_text: str) -> date | None:
        formats = (
            "%B %d %Y",
            "%b %d %Y",
            "%B %d, %Y",
            "%b %d, %Y",
            "%Y-%m-%d",
            "%m/%d/%Y",
            "%m/%d/%y",
            "%d/%m/%Y",
            "%d/%m/%y",
        )
        for fmt in formats:
            try:
                return datetime.strptime(date_text, fmt).date()
            except ValueError:
                continue
        return None

    def _parse_term_window(self, term: str | None) -> dict[str, date] | None:
        if term is None:
            return None

        match = TERM_REGEX.match(term)
        if not match:
            return None

        season = match.group(1).upper()
        year_raw = match.group(2)
        year = int(year_raw)
        if len(year_raw) == 2:
            year += 2000

        if season == "W":
            return {"year": year, "start": date(year, 1, 1), "end": date(year, 4, 30)}
        if season == "S":
            return {"year": year, "start": date(year, 5, 1), "end": date(year, 8, 31)}
        return {"year": year, "start": date(year, 9, 1), "end": date(year, 12, 31)}

    def _extract_partial_from_text(self, *, full_text: str, term: str | None) -> dict[str, Any]:
        section = self._detect_grading_section(full_text)
        lines = section.get("lines", [])
        if not lines:
            lines = self._bounded_lines(full_text)
        percentage_result = self._extract_percentages(lines)
        cluster_result = self._cluster_assessments(
            lines=lines,
            percentage_entries=percentage_result["filtered_entries"],
        )
        deadline_result = self._extract_deadlines(
            lines=lines,
            assessment_entries=cluster_result["assessment_entries"],
            term=term,
        )
        return {
            "assessments": cluster_result["assessments"],
            "assessment_entries": cluster_result["assessment_entries"],
            "deadlines": deadline_result["deadlines"],
        }

    def _bounded_lines(self, text: str) -> list[str]:
        bounded_text = text[:MAX_TEXT_CHARS]
        lines = [line.strip() for line in bounded_text.splitlines() if line.strip()]
        return lines[:MAX_SCAN_LINES]
