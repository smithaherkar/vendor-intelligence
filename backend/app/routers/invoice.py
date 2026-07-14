from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.database import get_db
from app import models_db, schemas, ml_models

router = APIRouter(prefix="/api/invoice", tags=["Invoice Risk"])


@router.post("/predict", response_model=schemas.InvoicePredictionOut)
def predict_invoice(payload: schemas.InvoiceInput, db: Session = Depends(get_db)):
    """
    Score one invoice for fraud/error risk and save the result to Postgres.
    """
    try:
        predicted_flag, probability = ml_models.predict_invoice_flag(payload.model_dump())
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Model prediction failed: {exc}")

    record = models_db.InvoicePrediction(
        invoice_quantity=payload.invoice_quantity,
        invoice_dollars=payload.invoice_dollars,
        freight=payload.Freight,
        total_item_quantity=payload.total_item_quantity,
        total_item_dollars=payload.total_item_dollars,
        predicted_flag=predicted_flag,
        risk_probability=probability,
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    return schemas.InvoicePredictionOut(
        id=record.id,
        invoice_dollars=record.invoice_dollars,
        freight=record.freight,
        predicted_flag=predicted_flag,
        risk_label="FLAGGED" if predicted_flag == 1 else "CLEARED",
        risk_probability=probability,
        created_at=record.created_at,
    )


@router.get("/history", response_model=list[schemas.InvoicePredictionOut])
def get_invoice_history(limit: int = 20, db: Session = Depends(get_db)):
    """
    Return the most recent invoice predictions, newest first.
    """
    rows = (
        db.query(models_db.InvoicePrediction)
        .order_by(desc(models_db.InvoicePrediction.created_at))
        .limit(limit)
        .all()
    )
    return [
        schemas.InvoicePredictionOut(
            id=r.id,
            invoice_dollars=r.invoice_dollars,
            freight=r.freight,
            predicted_flag=r.predicted_flag,
            risk_label="FLAGGED" if r.predicted_flag == 1 else "CLEARED",
            risk_probability=r.risk_probability,
            created_at=r.created_at,
        )
        for r in rows
    ]
