"""CLI Japanese TTS used by the Frontend API."""
import argparse
import os
from pathlib import Path

import numpy as np
import torch
from scipy.io.wavfile import write

import commons
import utils
from models import SynthesizerTrn
from text import text_to_sequence
from text.symbols import symbols

ROOT = Path(__file__).resolve().parent
_cache = {"net": None, "hps": None, "voice": None, "device": None}


def get_text(text, hps):
    text_norm = text_to_sequence(text, hps.data.text_cleaners)
    if hps.data.add_blank:
        text_norm = commons.intersperse(text_norm, 0)
    return torch.LongTensor(text_norm)


def load_voice(voice: str):
    device = "cuda" if torch.cuda.is_available() else "cpu"
    voice_path = ROOT / "model" / f"{voice}.pth"
    if not voice_path.exists():
        voice_path = ROOT / "model" / "ameth.pth"
        voice = "ameth"
    if _cache["net"] is not None and _cache["voice"] == voice:
        return _cache["net"], _cache["hps"], _cache["device"], voice

    hps = utils.get_hparams_from_file(str(ROOT / "configs" / "config-single-speaker.json"))
    net_g = SynthesizerTrn(
        len(symbols),
        hps.data.filter_length // 2 + 1,
        hps.train.segment_size // hps.data.hop_length,
        **hps.model,
    ).to(device)
    net_g.eval()
    utils.load_checkpoint(str(voice_path), net_g, None)
    _cache.update(net=net_g, hps=hps, voice=voice, device=device)
    return net_g, hps, device, voice


def synthesize_ja(text: str, voice: str = "ameth", pitch: float = 0.0):
    text = (text or "").strip()
    if not text:
        raise ValueError("Thiếu text")
    net_g, hps, device, used = load_voice(voice)
    stn = get_text(text, hps)
    with torch.no_grad():
        x = stn.to(device).unsqueeze(0)
        x_len = torch.LongTensor([stn.size(0)]).to(device)
        audio = net_g.infer(x, x_len, noise_scale=0.667, noise_scale_w=1, length_scale=1.2)[0][0, 0].data.cpu().float().numpy()
    audio = np.asarray(audio, dtype=np.float32)
    sr = int(hps.data.sampling_rate)
    if abs(pitch) >= 0.5:
        import librosa

        audio = librosa.effects.pitch_shift(audio, sr=sr, n_steps=float(pitch))
    peak = np.max(np.abs(audio)) or 1.0
    pcm = np.int16(np.clip(audio / peak, -1, 1) * 32767)
    return pcm, sr, used


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--text", required=True)
    p.add_argument("--voice", default="ameth")
    p.add_argument("--pitch", type=float, default=0)
    p.add_argument("--out", default="output.wav")
    args = p.parse_args()
    os.chdir(ROOT)
    pcm, sr, used = synthesize_ja(args.text, args.voice, args.pitch)
    write(args.out, sr, pcm)
    print(used)


if __name__ == "__main__":
    main()
