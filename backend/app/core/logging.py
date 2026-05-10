import structlog
import logging
from app.core.config import get_settings

def setup_logging():
    settings = get_settings()
    logging.basicConfig(level=getattr(logging, settings.log_level))
    structlog.configure(
        processors=[
            structlog.stdlib.add_log_level,
            structlog.stdlib.add_logger_name,
            structlog.dev.ConsoleRenderer(),
        ],
        wrapper_class=structlog.stdlib.BoundLogger,
        logger_factory=structlog.stdlib.LoggerFactory(),
    )

logger = structlog.get_logger()
