"""
This file sets up the connection to Postgres using SQLAlchemy.
Every other file that needs to talk to the database imports from here.
"""
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

from app.config import settings

# The "engine" is the object that actually knows how to talk to Postgres.
engine = create_engine(settings.database_url, pool_pre_ping=True)

# Each request gets its own database "conversation" (session).
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# All ORM models (tables) will inherit from this Base class.
Base = declarative_base()


def get_db():
    """
    FastAPI dependency: gives each request a fresh DB session
    and always closes it afterwards, even if an error happens.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
