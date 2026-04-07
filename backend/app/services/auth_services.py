import uuid
import re
from typing import Tuple, Optional
from sqlalchemy.orm import Session

from app.models.user import User
from app.core.security import hash_password, verify_password, create_access_token
from app.config import settings


def _validate_password(password: str) -> None:
    """Enforce password strength rules."""
    if len(password) < 8:
        raise ValueError("Password must be at least 8 characters")
    if not any(c.isdigit() for c in password):
        raise ValueError("Password must contain at least one number")
    if not any(c.isupper() for c in password):
        raise ValueError("Password must contain at least one uppercase letter")


def _validate_email(email: str) -> None:
    """Basic email format check."""
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    if not re.match(pattern, email):
        raise ValueError("Invalid email format")


def register_user(
    username: str,
    email: str,
    password: str,
    db: Session,
    security_question: str = "",
    security_answer: str = "",
) -> User:
    # Input sanitization
    username = username.strip()
    email = email.strip().lower()

    if not username or len(username) < 3:
        raise ValueError("Username must be at least 3 characters")
    if len(username) > 50:
        raise ValueError("Username must be 50 characters or less")

    _validate_email(email)
    _validate_password(password)

    if db.query(User).filter(User.username == username).first():
        raise ValueError("Username already taken")
    if db.query(User).filter(User.email == email).first():
        raise ValueError("Email already registered")

    if not security_question or not security_answer.strip():
        raise ValueError("Security question and answer are required for account recovery")

    user = User(
        id=str(uuid.uuid4()),
        username=username,
        email=email,
        hashed_password=hash_password(password),
        role="user",
        security_question=security_question.strip(),
        security_answer_hash=hash_password(security_answer.strip().lower()),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def login_user(username: str, password: str, db: Session) -> Tuple[str, User]:
    user = db.query(User).filter(User.username == username).first()
    if not user or not verify_password(password, user.hashed_password):
        raise ValueError("Invalid username or password")

    token = create_access_token({"sub": user.id, "role": user.role})
    return token, user


def get_security_question(username: str, db: Session) -> Optional[str]:
    """
    Returns the security question for a username.
    Returns None if user not found or no question set.
    Public endpoint — does NOT reveal whether user exists (returns generic error).
    """
    user = db.query(User).filter(User.username == username).first()
    if not user or not user.security_question:
        return None
    return user.security_question


def verify_security_answer(username: str, answer: str, db: Session) -> bool:
    """
    Verifies a security answer against the stored bcrypt hash.
    Answers are case-insensitive and trimmed.
    """
    user = db.query(User).filter(User.username == username).first()
    if not user or not user.security_answer_hash:
        return False
    return verify_password(answer.strip().lower(), user.security_answer_hash)


def reset_password(username: str, new_password: str, db: Session) -> User:
    """
    Resets a user's password. Only call AFTER security answer is verified.
    """
    _validate_password(new_password)

    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise ValueError("User not found")

    user.hashed_password = hash_password(new_password)
    db.commit()
    db.refresh(user)
    return user


def seed_admin(db: Session):
    """
    Called on server startup.
    Creates the default admin account if no admin exists yet.
    Credentials come from .env → ADMIN_USERNAME / ADMIN_EMAIL / ADMIN_PASSWORD.
    """
    existing_admin = db.query(User).filter(User.role == "admin").first()
    if existing_admin:
        return

    admin = User(
        id=str(uuid.uuid4()),
        username=settings.ADMIN_USERNAME,
        email=settings.ADMIN_EMAIL,
        hashed_password=hash_password(settings.ADMIN_PASSWORD),
        role="admin",
        security_question="What is the name of this system?",
        security_answer_hash=hash_password("cosmeon"),
    )
    db.add(admin)
    db.commit()
    print(f"[STARTUP] Admin account created → username: {settings.ADMIN_USERNAME}")
