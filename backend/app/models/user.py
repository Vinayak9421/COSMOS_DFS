import uuid
from sqlalchemy import Column, String, DateTime
from sqlalchemy.sql import func
from app.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    username = Column(String(150), unique=True, nullable=False, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    role = Column(String(20), default="user")       # "user" or "admin"

    # ── Security Q&A for password recovery ────────────────────────────────
    security_question = Column(String(500), nullable=True)
    security_answer_hash = Column(String(255), nullable=True)  # bcrypt hashed

    created_at = Column(DateTime, server_default=func.now())
