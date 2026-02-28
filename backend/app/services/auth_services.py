import uuid
from typing import Tuple
from sqlalchemy.orm import Session

from app.models.user import User
from app.core.security import hash_password, verify_password, create_access_token
from app.config import settings


def register_user(username: str, email: str, password: str, db: Session) -> User:
    if db.query(User).filter(User.username == username).first():
        raise ValueError("Username already taken")
    if db.query(User).filter(User.email == email).first():
        raise ValueError("Email already registered")
    if len(password) < 6:
        raise ValueError("Password must be at least 6 characters")

    user = User(
        id=str(uuid.uuid4()),
        username=username,
        email=email,
        hashed_password=hash_password(password),
        role="user",
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


def seed_admin(db: Session):
    """
    Called on server startup (Option A).
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
    )
    db.add(admin)
    db.commit()
    print(f"[STARTUP] Admin account created → username: {settings.ADMIN_USERNAME}")
