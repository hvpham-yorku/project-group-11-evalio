from json import JSONDecodeError

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from pydantic import ValidationError

from app.dependencies import get_current_user, get_extraction_service
from app.models_extraction import ExtractionResponse, OutlineExtractionRequest
from app.services.auth_service import AuthenticatedUser
from app.services.extraction_service import ExtractionService

router = APIRouter(prefix="/extraction", tags=["Extraction"])
MAX_UPLOAD_BYTES = 10 * 1024 * 1024


@router.post("/outline", response_model=ExtractionResponse)
async def extract_outline(
    request: Request,
    service: ExtractionService = Depends(get_extraction_service),
    file: UploadFile | None = File(None),
    term: str | None = Form(None),
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> ExtractionResponse:
    _ = current_user
    content_type = request.headers.get("content-type", "").lower()
    if "multipart/form-data" in content_type:
        if file is None:
            raise HTTPException(status_code=422, detail="file required")
        file_bytes = await file.read()
        if not file_bytes:
            raise HTTPException(status_code=422, detail="file required")
        if len(file_bytes) > MAX_UPLOAD_BYTES:
            raise HTTPException(status_code=413, detail="file too large (max 10MB)")
        return service.extract(
            filename=file.filename or "uploaded_file",
            content_type=file.content_type or "application/octet-stream",
            file_bytes=file_bytes,
            term=term,
        )

    if "application/json" not in content_type:
        raise HTTPException(status_code=422, detail="file required")

    raw_body = await request.body()
    if not raw_body.strip():
        raise HTTPException(status_code=422, detail="file required")

    try:
        payload_data = await request.json()
    except JSONDecodeError as exc:
        raise HTTPException(status_code=422, detail="invalid legacy payload") from exc
    except Exception as exc:
        raise HTTPException(status_code=422, detail="invalid legacy payload") from exc

    try:
        payload = OutlineExtractionRequest.model_validate(payload_data)
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail="invalid legacy payload") from exc
    return service.extract_legacy(payload)
