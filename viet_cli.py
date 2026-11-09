"""Generate Vietnamese speech via SpeechTiengViet CLI."""
import argparse
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
VIET_DIR = ROOT.parent / "SpeechTiengViet"
VIET_PY = VIET_DIR / ".venv" / "Scripts" / "python.exe"
VIET_APP = VIET_DIR / "app.py"


def synthesize_vi(text: str, out_path: Path, voice: str = "Trúc Ly") -> Path:
    text = (text or "").strip()
    if not text:
        raise ValueError("Thiếu text tiếng Việt")
    if not VIET_PY.exists() or not VIET_APP.exists():
        raise RuntimeError(
            "Không thấy SpeechTiengViet. Cần thư mục ../SpeechTiengViet với .venv đã cài."
        )
    out_path.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        str(VIET_PY),
        str(VIET_APP),
        text,
        "-e",
        "vieneu",
        "-v",
        voice,
        "-o",
        str(out_path),
    ]
    proc = subprocess.run(cmd, cwd=str(VIET_DIR), capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr[-2000:] or proc.stdout[-2000:] or "VieNeu TTS thất bại")
    if not out_path.exists() or out_path.stat().st_size < 44:
        raise RuntimeError("Không tạo được file TTS tiếng Việt")
    return out_path


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--text", required=True)
    p.add_argument("--out", required=True)
    p.add_argument("--voice", default="Trúc Ly")
    args = p.parse_args()
    path = synthesize_vi(args.text, Path(args.out), args.voice)
    print(path)
