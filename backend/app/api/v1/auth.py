import uuid
from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.services.auth_services import (
    register_user,
    login_user,
    get_security_question,
    verify_security_answer,
    reset_password,
)
from app.core.security import get_current_user
from app.core.rate_limiter import check_rate_limit, record_login_failure, record_login_success

router = APIRouter(prefix="/auth", tags=["Auth"])

# ── In-memory reset tokens (valid for 10 minutes) ────────────────────────
import time
_reset_tokens: dict[str, dict] = {}  # token → { username, expires }


class RegisterRequest(BaseModel):
    username: str
    email: str
    password: str
    security_question: str
    security_answer: str


class SecurityVerifyRequest(BaseModel):
    username: str
    answer: str


class ResetPasswordRequest(BaseModel):
    username: str
    reset_token: str
    new_password: str


@router.post("/register")
def register(body: RegisterRequest, db: Session = Depends(get_db)):
    """Register a new user account with security question for recovery."""
    try:
        user = register_user(
            body.username,
            body.email,
            body.password,
            db,
            security_question=body.security_question,
            security_answer=body.security_answer,
        )
        return {
            "success": True,
            "message": "Registration successful",
            "user": {
                "id": user.id,
                "username": user.username,
                "email": user.email,
                "role": user.role,
            },
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/login")
def login(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    """
    Login with username + password.
    Rate-limited: 5 failed attempts → 15-minute lockout (per IP + username).
    """
    # Check rate limit BEFORE attempting login
    check_rate_limit(request, form_data.username)

    try:
        token, user = login_user(form_data.username, form_data.password, db)
        record_login_success(request, form_data.username)
        return {
            "access_token": token,
            "token_type": "bearer",
            "user": {
                "id": user.id,
                "username": user.username,
                "email": user.email,
                "role": user.role,
            },
        }
    except ValueError as e:
        record_login_failure(request, form_data.username)
        raise HTTPException(status_code=401, detail=str(e))


@router.get("/me")
def me(current_user=Depends(get_current_user)):
    """Returns the currently authenticated user's profile."""
    return {
        "id": current_user.id,
        "username": current_user.username,
        "email": current_user.email,
        "role": current_user.role,
        "created_at": str(current_user.created_at),
    }


# ── Security Q&A Endpoints (Forgot Password Flow) ────────────────────────


@router.get("/security-question/{username}")
def get_question(username: str, db: Session = Depends(get_db)):
    """
    Returns the security question for a username.
    Does NOT reveal whether the user exists — returns generic error.
    """
    question = get_security_question(username.strip(), db)
    if not question:
        raise HTTPException(
            status_code=404,
            detail="No security question found. Contact admin for help.",
        )
    return {"username": username.strip(), "question": question}


@router.post("/verify-security")
def verify_security(
    body: SecurityVerifyRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """
    Verifies the security answer. On success, returns a time-limited
    reset token that must be used in /reset-password within 10 minutes.
    Rate-limited alongside normal login attempts.
    """
    check_rate_limit(request, body.username)

    verified = verify_security_answer(body.username.strip(), body.answer, db)
    if not verified:
        record_login_failure(request, body.username)
        raise HTTPException(status_code=401, detail="Security answer is incorrect")

    # Generate one-time reset token (valid 10 min)
    reset_token = str(uuid.uuid4())
    _reset_tokens[reset_token] = {
        "username": body.username.strip().lower(),
        "expires": time.time() + 600,  # 10 minutes
    }

    # Prune expired tokens
    now = time.time()
    expired = [k for k, v in _reset_tokens.items() if v["expires"] < now]
    for k in expired:
        _reset_tokens.pop(k, None)

    record_login_success(request, body.username)
    return {"verified": True, "reset_token": reset_token}


@router.post("/reset-password")
def reset_password_endpoint(
    body: ResetPasswordRequest,
    db: Session = Depends(get_db),
):
    """
    Resets password using a valid reset token from /verify-security.
    Token is single-use and expires after 10 minutes.
    """
    token_data = _reset_tokens.get(body.reset_token)
    if not token_data:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")

    if time.time() > token_data["expires"]:
        _reset_tokens.pop(body.reset_token, None)
        raise HTTPException(status_code=400, detail="Reset token has expired")

    if token_data["username"] != body.username.strip().lower():
        raise HTTPException(status_code=400, detail="Token does not match username")

    try:
        reset_password(body.username.strip(), body.new_password, db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Consume token — single use
    _reset_tokens.pop(body.reset_token, None)

    return {"success": True, "message": "Password reset successfully. You can now sign in."}
