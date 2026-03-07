import os
from typing import Tuple

DEBUG = os.getenv("FILTER_DEBUG") == "1"

ANCHOR_PHRASES = [
    "course evaluation",
    "evaluation scheme",
    "evaluation",
    "grading scheme",
    "grading policy",
    "grading",
    "grade breakdown",
    "marking scheme",
    "graded assessment",
    "assessment evaluation",
    "graded assessment evaluation",
    "assessment",
    "assessments",
]
LINES_ABOVE = 5
LINES_BELOW = 30


class GradingSectionFilter:
    _ALLOWED_FOLLOWING_CHARS = {":", "-", "(", ")"}

    def __init__(self) -> None:
        self._debug_enabled = DEBUG

    def filter(self, text: str) -> Tuple[str, bool]:
        if not text:
            return text, False

        lines = text.splitlines()
        if not lines:
            return text, False

        windows: list[tuple[int, int]] = []
        for idx, raw_line in enumerate(lines):
            normalized_line = raw_line.strip().lower()
            if not self._is_anchor_line(normalized_line):
                continue

            start = max(0, idx - LINES_ABOVE)
            end = min(len(lines), idx + LINES_BELOW + 1)
            windows.append((start, end))
            if self._debug_enabled:
                self._print_debug_block(
                    "ANCHOR_FOUND",
                    line_index=idx,
                    line=raw_line.strip(),
                    window_start=start,
                    window_end=end,
                )

        if not windows:
            if self._debug_enabled:
                self._print_debug_block(
                    "FILTER_RESULT",
                    strategy="fallback",
                    reason="no_anchor",
                    filtered_used=False,
                )
            return text, False

        merged_windows = self._merge_windows(windows)
        merged_sections = ["\n".join(lines[start:end]) for start, end in merged_windows]
        merged_text = "\n".join(section for section in merged_sections if section).strip()

        if not merged_text:
            if self._debug_enabled:
                self._print_debug_block(
                    "FILTER_RESULT",
                    strategy="fallback",
                    reason="empty_after_merge",
                    filtered_used=False,
                )
            return text, False

        if self._debug_enabled:
            self._print_debug_block(
                "FILTER_RESULT",
                strategy="anchor_window_merge",
                filtered_used=True,
                window_count=len(windows),
                merged_window_count=len(merged_windows),
                merged_windows_preview=merged_windows[:10],
                filtered_line_count=sum(end - start for start, end in merged_windows),
                filtered_length=len(merged_text),
            )
        return merged_text, True

    def _is_anchor_line(self, normalized_line: str) -> bool:
        if not normalized_line:
            return False
        if len(normalized_line.split()) > 8:
            return False

        for anchor in ANCHOR_PHRASES:
            if normalized_line == anchor:
                return True
            if normalized_line.startswith(anchor):
                next_index = len(anchor)
                if next_index >= len(normalized_line):
                    return True
                if normalized_line[next_index] in self._ALLOWED_FOLLOWING_CHARS:
                    return True
        return False

    def _merge_windows(self, windows: list[tuple[int, int]]) -> list[tuple[int, int]]:
        if not windows:
            return []
        sorted_windows = sorted(windows, key=lambda item: item[0])
        merged: list[list[int]] = [[sorted_windows[0][0], sorted_windows[0][1]]]
        for start, end in sorted_windows[1:]:
            last_start, last_end = merged[-1]
            if start < last_end:
                merged[-1][1] = max(last_end, end)
            else:
                merged.append([start, end])
        return [(start, end) for start, end in merged]

    def _print_debug_block(self, tag: str, **fields: object) -> None:
        if not self._debug_enabled:
            return
        print(f"[{tag}]")
        for key, value in fields.items():
            print(f"{key}={value}")
