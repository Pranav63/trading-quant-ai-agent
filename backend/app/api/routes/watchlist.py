from fastapi import APIRouter
from app.core.watchlist import WATCHLIST

router = APIRouter(prefix="/watchlist", tags=["watchlist"])

@router.get("")
def get_watchlist():
    return WATCHLIST