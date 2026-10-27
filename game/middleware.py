import logging
import time


request_logger = logging.getLogger("game.request")


class RequestLogMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        started = time.monotonic()
        response = self.get_response(request)
        elapsed_ms = round((time.monotonic() - started) * 1000)
        request_logger.info(
            "%s %s %s %sms",
            request.method,
            request.path,
            response.status_code,
            elapsed_ms,
        )
        return response
