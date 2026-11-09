"""Serve Frontend and generate WAV files for export."""
from __future__ import annotations

import cgi
import json
import logging
import os
import subprocess
import sys
import time
import urllib.parse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FRONTEND = Path(__file__).resolve().parent
EXPORTS = FRONTEND / "exports"
TMP = FRONTEND / "tmp"
RVC_PY = ROOT / "rvc_env" / "Scripts" / "python.exe"
VIET_DIR = ROOT.parent / "SpeechTiengViet"
VIET_PY = VIET_DIR / ".venv" / "Scripts" / "python.exe"
PORT = 5173

os.chdir(FRONTEND)
sys.path.insert(0, str(ROOT))
EXPORTS.mkdir(exist_ok=True)
TMP.mkdir(exist_ok=True)

logging.getLogger("numba").setLevel(logging.WARNING)
logging.getLogger("matplotlib").setLevel(logging.WARNING)


def run_rvc(src: Path, out_path: Path, pitch: int) -> None:
    cmd = [
        str(RVC_PY),
        str(ROOT / "rvc_cli.py"),
        "--in",
        str(src),
        "--out",
        str(out_path),
        "--pitch",
        str(int(pitch)),
    ]
    proc = subprocess.run(cmd, cwd=str(ROOT), capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr[-2000:] or proc.stdout[-2000:] or "RVC thất bại")


def tts_viet_text(text: str, out_path: Path) -> None:
    from viet_cli import synthesize_vi

    synthesize_vi(text, out_path)


def json_bytes(payload: dict) -> bytes:
    return json.dumps(payload, ensure_ascii=False).encode("utf-8")


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {
        **getattr(SimpleHTTPRequestHandler, "extensions_map", {}),
        ".wav": "audio/wav",
        ".mjs": "text/javascript",
        ".js": "text/javascript",
        ".moc3": "application/octet-stream",
        ".json": "application/json",
        ".png": "image/png",
        ".exp3.json": "application/json",
        ".motion3.json": "application/json",
        ".motionsync3.json": "application/json",
    }

    def end_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Accept-Ranges", "bytes")
        super().end_headers()

    def log_message(self, fmt: str, *args) -> None:
        print(f"[ui] {self.address_string()} {fmt % args}")

    def translate_path(self, path: str) -> str:
        path = path.split("?", 1)[0]
        path = path.split("#", 1)[0]
        path = urllib.parse.unquote(path)
        parts = [p for p in path.split("/") if p]
        return str(FRONTEND.joinpath(*parts)) if parts else str(FRONTEND)

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_POST(self) -> None:
        if self.path.rstrip("/") != "/api/generate":
            self.send_error(404)
            return
        try:
            form = cgi.FieldStorage(
                fp=self.rfile,
                headers=self.headers,
                environ={
                    "REQUEST_METHOD": "POST",
                    "CONTENT_TYPE": self.headers.get("Content-Type", ""),
                },
            )
            lang = (form.getfirst("lang") or "ja").strip()
            voice = (form.getfirst("voice") or "ameth").strip()
            text = form.getfirst("text") or ""
            pitch = float(form.getfirst("pitch") or 0)
            if lang == "ja":
                pitch = 0
            stamp = time.strftime("%Y%m%d-%H%M%S")
            out_name = f"{lang}_{voice}_{stamp}.wav"
            out_path = EXPORTS / out_name

            if lang == "vi":
                text = (text or "").strip()
                item = form["audio"] if "audio" in form else None
                has_audio = item is not None and getattr(item, "filename", None)
                if has_audio:
                    src = TMP / f"in_{stamp}_{item.filename}"
                    with open(src, "wb") as f:
                        f.write(item.file.read())
                elif text:
                    src = TMP / f"tts_{stamp}.wav"
                    tts_viet_text(text, src)
                else:
                    raise ValueError("Tiếng Việt: nhập text hoặc chọn file audio.")
                run_rvc(src, out_path, int(pitch))
            else:
                from infer_cli import synthesize_ja
                from scipy.io.wavfile import write

                pcm, sr, used = synthesize_ja(text, voice, pitch)
                write(str(out_path.resolve()), sr, pcm)
                voice = used

            if not out_path.exists() or out_path.stat().st_size < 44:
                raise RuntimeError("Không tạo được file WAV")
            body = json_bytes(
                {
                    "ok": True,
                    "url": f"/exports/{out_name}",
                    "filename": out_name,
                    "voice": voice,
                }
            )
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)
        except Exception as e:
            body = json_bytes({"error": str(e)})
            self.send_response(400)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(body)


def main() -> None:
    httpd = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"Frontend  http://127.0.0.1:{PORT}/")
    print(f"Exports   {EXPORTS}")
    httpd.serve_forever()


if __name__ == "__main__":
    main()
