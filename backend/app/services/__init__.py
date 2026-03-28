__all__ = [
    "AuthService",
    "AuthenticatedUser",
    "AuthValidationError",
    "AuthConflictError",
    "AuthenticationError",
    "CourseService",
    "CourseNotFoundError",
    "CourseValidationError",
    "CourseConflictError",
]


def __getattr__(name: str):
    if name in {
        "AuthService",
        "AuthenticatedUser",
        "AuthValidationError",
        "AuthConflictError",
        "AuthenticationError",
    }:
        from app.services.auth_service import (
            AuthConflictError,
            AuthenticationError,
            AuthenticatedUser,
            AuthService,
            AuthValidationError,
        )

        exports = {
            "AuthService": AuthService,
            "AuthenticatedUser": AuthenticatedUser,
            "AuthValidationError": AuthValidationError,
            "AuthConflictError": AuthConflictError,
            "AuthenticationError": AuthenticationError,
        }
        return exports[name]

    if name in {
        "CourseService",
        "CourseNotFoundError",
        "CourseValidationError",
        "CourseConflictError",
    }:
        from app.services.course_service import (
            CourseConflictError,
            CourseNotFoundError,
            CourseService,
            CourseValidationError,
        )

        exports = {
            "CourseService": CourseService,
            "CourseNotFoundError": CourseNotFoundError,
            "CourseValidationError": CourseValidationError,
            "CourseConflictError": CourseConflictError,
        }
        return exports[name]

    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
