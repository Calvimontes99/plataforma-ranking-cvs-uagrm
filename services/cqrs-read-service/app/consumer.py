import logging
import os
import threading
import time

import pika
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.projection import ProjectionRepository, decode_event

logger = logging.getLogger(__name__)


class RabbitEventConsumer:
    def __init__(self, session_factory=SessionLocal):
        self.session_factory = session_factory
        self.stop_event = threading.Event()
        self.thread: threading.Thread | None = None

    def start(self) -> None:
        if self.thread and self.thread.is_alive():
            return
        self.thread = threading.Thread(target=self._run, name="cqrs-rabbit-consumer", daemon=True)
        self.thread.start()

    def stop(self) -> None:
        self.stop_event.set()
        if self.thread:
            self.thread.join(timeout=5)

    def _run(self) -> None:
        url = os.getenv("RABBITMQ_URL", "amqp://guest:guest@localhost:5672/%2F")
        exchange = os.getenv("RABBITMQ_EXCHANGE", "recruitment.events")
        queue = os.getenv("RABBITMQ_QUEUE", "cqrs-read-service")
        while not self.stop_event.is_set():
            connection = None
            try:
                params = pika.URLParameters(url)
                params.heartbeat = 30
                connection = pika.BlockingConnection(params)
                channel = connection.channel()
                channel.exchange_declare(exchange=exchange, exchange_type="topic", durable=True)
                channel.queue_declare(queue=queue, durable=True)
                channel.queue_bind(queue=queue, exchange=exchange, routing_key="#")
                channel.basic_qos(prefetch_count=20)
                channel.basic_consume(queue=queue, on_message_callback=self._on_message)
                while connection.is_open and not self.stop_event.is_set():
                    connection.process_data_events(time_limit=1)
            except Exception:
                logger.exception("RabbitMQ consumer disconnected; retrying")
                self.stop_event.wait(3)
            finally:
                if connection and connection.is_open:
                    try:
                        connection.close()
                    except Exception:
                        logger.debug("RabbitMQ connection cleanup failed", exc_info=True)

    def _on_message(self, channel, method, properties, body: bytes) -> None:
        session: Session | None = None
        try:
            event = decode_event(body)
            headers = getattr(properties, "headers", None) or {}
            event.setdefault("eventType", headers.get("eventType") or method.routing_key)
            event.setdefault("eventId", getattr(properties, "message_id", None))
            session = self.session_factory()
            ProjectionRepository(session).apply_event(event)
            channel.basic_ack(delivery_tag=method.delivery_tag)
        except (ValueError, UnicodeDecodeError):
            logger.warning("Discarding invalid RabbitMQ event", exc_info=True)
            channel.basic_reject(delivery_tag=method.delivery_tag, requeue=False)
        except Exception:
            logger.exception("Projection update failed; event will be retried")
            channel.basic_nack(delivery_tag=method.delivery_tag, requeue=True)
        finally:
            if session:
                session.close()
