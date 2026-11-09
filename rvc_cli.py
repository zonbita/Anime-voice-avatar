"""CLI RVC conversion used by the Frontend API."""
import argparse
import io
import sys
from pathlib import Path

import numpy as np
from scipy.io import wavfile
from rvc_python.infer import RVCInference

ROOT = Path(__file__).resolve().parent
MODEL = ROOT / "rvc_models" / "A_e200.pth"


def extract_wav(result):
    if isinstance(result, np.ndarray):
        return result
    if isinstance(result, tuple):
        for item in result:
            wav = extract_wav(item)
            if wav is not None:
                return wav
    return None


def convert(input_path: str, output_path: str, pitch: int = 5):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
    rvc = RVCInference(device="cpu")
    rvc.load_model(str(MODEL))
    rvc.set_params(f0method="rmvpe", f0up_key=int(pitch))
    file_index = rvc.models[rvc.current_model].get("index", "")
    wav_opt = rvc.vc.vc_single(
        sid=0,
        input_audio_path=input_path,
        f0_up_key=rvc.f0up_key,
        f0_method=rvc.f0method,
        file_index=file_index,
        index_rate=rvc.index_rate,
        filter_radius=rvc.filter_radius,
        resample_sr=rvc.resample_sr,
        rms_mix_rate=rvc.rms_mix_rate,
        protect=rvc.protect,
        f0_file="",
        file_index2="",
    )
    wav = np.asarray(extract_wav(wav_opt))
    wavfile.write(output_path, rvc.vc.tgt_sr, wav)
    print(output_path)


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--in", dest="inp", required=True)
    p.add_argument("--out", required=True)
    p.add_argument("--pitch", type=int, default=5)
    args = p.parse_args()
    convert(args.inp, args.out, args.pitch)
