from __future__ import annotations

import io
import shutil
from typing import Any

from app.services.extraction.constants import MAX_OCR_PAGES, PDF_SUSPICIOUS_TEXT_THRESHOLD


class TextIngestMixin:
    def _extract_text(self, *, filename: str, content_type: str, file_bytes: bytes) -> dict[str, Any]:
        lowered_name = filename.lower()
        lowered_type = content_type.lower()
        if lowered_name.endswith(".txt") or "text/plain" in lowered_type:
            txt_result = self._extract_text_txt(file_bytes)
            return {
                "text": txt_result["text"],
                "ocr_used": False,
                "ocr_available": True,
                "ocr_error": None,
                "parse_warnings": txt_result["parse_warnings"],
            }

        if lowered_name.endswith(".docx") or "wordprocessingml.document" in lowered_type:
            docx_result = self._extract_text_docx(file_bytes)
            return {
                "text": docx_result["text"],
                "ocr_used": False,
                "ocr_available": True,
                "ocr_error": None,
                "parse_warnings": docx_result["parse_warnings"],
            }

        if (
            lowered_name.endswith(".png")
            or lowered_name.endswith(".jpg")
            or lowered_name.endswith(".jpeg")
            or "image/png" in lowered_type
            or "image/jpeg" in lowered_type
            or "image/jpg" in lowered_type
        ):
            return self._extract_text_image(file_bytes)

        if lowered_name.endswith(".pdf") or "application/pdf" in lowered_type:
            return self._extract_text_pdf(file_bytes)

        return {
            "text": "",
            "ocr_used": False,
            "ocr_available": True,
            "ocr_error": f"Unsupported file type for {filename}",
            "parse_warnings": [
                self._format_warning(
                    "unsupported_file_type",
                    f"Unsupported file type for {filename}",
                )
            ],
        }

    def _extract_text_txt(self, file_bytes: bytes) -> dict[str, Any]:
        return {
            "text": file_bytes.decode("utf-8", errors="replace"),
            "parse_warnings": [],
        }

    def _extract_text_docx(self, file_bytes: bytes) -> dict[str, Any]:
        parse_warnings: list[str] = []
        try:
            from docx import Document
        except ImportError as exc:
            parse_warnings.append(self._format_warning("docx_import_error", str(exc)))
            return {"text": "", "parse_warnings": parse_warnings}

        try:
            document = Document(io.BytesIO(file_bytes))
        except Exception as exc:
            parse_warnings.append(self._format_warning("docx_parse_error", str(exc)))
            return {"text": "", "parse_warnings": parse_warnings}

        text = "\n".join(
            paragraph.text.strip() for paragraph in document.paragraphs if paragraph.text.strip()
        )
        return {"text": text, "parse_warnings": parse_warnings}

    def _extract_text_pdf(self, file_bytes: bytes) -> dict[str, Any]:
        primary_text = ""
        pdfplumber_failed = False
        parse_warnings: list[str] = []
        try:
            import pdfplumber

            with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
                page_texts = [(page.extract_text() or "").strip() for page in pdf.pages]
            primary_text = "\n".join(part for part in page_texts if part)
        except Exception as exc:
            pdfplumber_failed = True
            parse_warnings.append(self._format_warning("pdf_parse_error", str(exc)))

        if not self._should_trigger_ocr(primary_text, pdfplumber_failed=pdfplumber_failed):
            return {
                "text": primary_text,
                "ocr_used": False,
                "ocr_available": True,
                "ocr_error": None,
                "parse_warnings": parse_warnings,
            }

        ocr_result = self._extract_text_ocr(file_bytes)
        parse_warnings.extend(ocr_result["parse_warnings"])
        if ocr_result["text"].strip():
            return {
                "text": ocr_result["text"],
                "ocr_used": True,
                "ocr_available": ocr_result["available"],
                "ocr_error": ocr_result["error"],
                "parse_warnings": parse_warnings,
            }

        if not primary_text.strip():
            parse_warnings = self._merge_parse_warnings(
                parse_warnings,
                ["text_extraction_failed"],
            )
            return {
                "text": "",
                "ocr_used": False,
                "ocr_available": ocr_result["available"],
                "ocr_error": ocr_result["error"],
                "parse_warnings": parse_warnings,
            }

        return {
            "text": primary_text,
            "ocr_used": False,
            "ocr_available": ocr_result["available"],
            "ocr_error": ocr_result["error"],
            "parse_warnings": parse_warnings,
        }

    def _should_trigger_ocr(self, text: str, *, pdfplumber_failed: bool = False) -> bool:
        if pdfplumber_failed:
            return True
        normalized = text.strip()
        return len(normalized) < PDF_SUSPICIOUS_TEXT_THRESHOLD

    def _extract_text_ocr(self, file_bytes: bytes) -> dict[str, Any]:
        parse_warnings: list[str] = []
        if shutil.which("tesseract") is None or shutil.which("pdftoppm") is None:
            message = "OCR dependencies not available (tesseract or poppler missing)"
            parse_warnings.append(self._format_warning("ocr_dependencies_missing", message))
            return {
                "text": "",
                "available": False,
                "error": message,
                "parse_warnings": parse_warnings,
            }
        try:
            from pdf2image import convert_from_bytes
            import pytesseract
        except ImportError as exc:
            parse_warnings.append(self._format_warning("ocr_import_error", str(exc)))
            return {
                "text": "",
                "available": False,
                "error": self._truncate_error(f"OCR package missing: {exc}"),
                "parse_warnings": parse_warnings,
            }

        try:
            images = convert_from_bytes(
                file_bytes,
                first_page=1,
                last_page=MAX_OCR_PAGES,
            )
            chunks = [pytesseract.image_to_string(image).strip() for image in images]
            return {
                "text": "\n".join(part for part in chunks if part),
                "available": True,
                "error": None,
                "parse_warnings": parse_warnings,
            }
        except Exception as exc:
            parse_warnings.append(self._format_warning("ocr_runtime_error", str(exc)))
            return {
                "text": "",
                "available": True,
                "error": self._truncate_error(f"OCR failed: {exc}"),
                "parse_warnings": parse_warnings,
            }

    def _extract_text_image(self, file_bytes: bytes) -> dict[str, Any]:
        parse_warnings: list[str] = []
        if shutil.which("tesseract") is None:
            message = "OCR dependencies not available (tesseract missing)"
            parse_warnings.append(self._format_warning("ocr_dependencies_missing", message))
            return {
                "text": "",
                "ocr_used": True,
                "ocr_available": False,
                "ocr_error": message,
                "parse_warnings": parse_warnings,
            }

        try:
            from PIL import Image
            import pytesseract
        except ImportError as exc:
            parse_warnings.append(self._format_warning("ocr_import_error", str(exc)))
            return {
                "text": "",
                "ocr_used": True,
                "ocr_available": False,
                "ocr_error": self._truncate_error(f"OCR package missing: {exc}"),
                "parse_warnings": parse_warnings,
            }

        try:
            with Image.open(io.BytesIO(file_bytes)) as image:
                text = pytesseract.image_to_string(image)
            return {
                "text": text,
                "ocr_used": True,
                "ocr_available": True,
                "ocr_error": None,
                "parse_warnings": parse_warnings,
            }
        except Exception as exc:
            parse_warnings.append(self._format_warning("ocr_image_failure", str(exc)))
            return {
                "text": "",
                "ocr_used": True,
                "ocr_available": True,
                "ocr_error": self._truncate_error(f"OCR image extraction failed: {exc}"),
                "parse_warnings": parse_warnings,
            }

