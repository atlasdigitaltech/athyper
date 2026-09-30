"""Internal multipart /render protocol. One active native-parser child per sidecar."""
import base64
import email.policy
from email.parser import BytesParser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import subprocess
import threading

slot = threading.BoundedSemaphore(1)
MAX_REQUEST = 21 * 1024**2

class Handler(BaseHTTPRequestHandler):
    def reply(self, status, value):
        data = json.dumps(value).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        self.reply(200 if self.path == "/health" else 404, {"protocol": "athyper.derivatives/1"})

    def do_POST(self):
        if self.path != "/render":
            return self.reply(404, {})
        if not slot.acquire(blocking=False):
            return self.reply(429, {"code": "RENDERER_BUSY"})
        try:
            self.connection.settimeout(25)
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= MAX_REQUEST:
                return self.reply(413, {"code": "INPUT_LIMIT"})
            media = self.headers.get("Content-Type", "")
            if not media.startswith("multipart/form-data;"):
                return self.reply(415, {"code": "MULTIPART_REQUIRED"})
            raw = self.rfile.read(length)
            if len(raw) != length:
                return self.reply(400, {})
            message = BytesParser(policy=email.policy.default).parsebytes(("Content-Type: " + media + "\r\n\r\n").encode() + raw)
            fields = {}
            for part in message.iter_parts():
                name = part.get_param("name", header="content-disposition")
                if name in fields or name not in ("content", "sourceContentType", "renditionCode", "specificationHash"):
                    return self.reply(400, {})
                value = part.get_payload(decode=True)
                fields[name] = base64.b64encode(value).decode() if name == "content" else value.decode()
            fields["bytes"] = fields.pop("content")
            process = subprocess.run(["python", "/app/render.py"], input=json.dumps(fields), capture_output=True, text=True, timeout=25)
            result = json.loads(process.stdout) if process.stdout else {"skipped": True}
            self.reply(200 if process.returncode == 0 else 422, result)
        except subprocess.TimeoutExpired:
            self.reply(504, {"code": "RENDER_TIMEOUT"})
        except Exception:
            self.reply(400, {"code": "INVALID_REQUEST"})
        finally:
            slot.release()

    def log_message(self, *args):
        pass

ThreadingHTTPServer(("0.0.0.0", 3000), Handler).serve_forever()
