"""Make raw 16 kHz mono PCM from a synthetic voice fixture on the test host."""
from pathlib import Path
from faster_whisper.audio import decode_audio
root = Path(__file__).resolve().parents[1]
audio = root / 'test-results/synthetic-economics.wav'
if not audio.exists():
    audio = root / 'test-results/synthetic-economics.aiff'
decode_audio(str(audio), sampling_rate=16000).astype('<f4').tofile(root / 'test-results/synthetic-economics.raw')
