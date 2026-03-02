import os


def _get_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _get_list(name: str, default: list[str]) -> list[str]:
    value = os.getenv(name)
    if value is None:
        return default
    return [item.strip() for item in value.split(",") if item.strip()]


AUTH_SECRET_KEY = os.getenv("AUTH_SECRET_KEY", "dev-insecure-secret-change-me")
AUTH_ALGORITHM = os.getenv("AUTH_ALGORITHM", "HS256")
AUTH_ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("AUTH_ACCESS_TOKEN_EXPIRE_MINUTES", "480"))
AUTH_COOKIE_NAME = os.getenv("AUTH_COOKIE_NAME", "evalio_access_token")
AUTH_COOKIE_SECURE = _get_bool("AUTH_COOKIE_SECURE", False)

FRONTEND_ORIGINS = _get_list(
    "FRONTEND_ORIGINS",
    [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
)
