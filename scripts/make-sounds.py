"""Synthesise the app's sound effects (no third-party audio, so no licensing).

  python3 scripts/make-sounds.py   -> assets/sounds/*.wav
"""
import math, os, struct, wave

RATE = 22050
OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'sounds')


def note(freq, dur, vol=0.5, shape='bell', attack=0.005):
    n = int(RATE * dur)
    out = []
    for i in range(n):
        t = i / RATE
        env = min(1.0, t / attack) * math.exp(-t * (5.5 / dur))
        if shape == 'bell':  # sine + soft overtone: a friendly chime
            s = math.sin(2 * math.pi * freq * t) + 0.35 * math.sin(2 * math.pi * freq * 2 * t) * math.exp(-t * 12)
        elif shape == 'soft':  # rounded square: a gentle "bonk"
            s = math.tanh(3 * math.sin(2 * math.pi * freq * t)) * 0.6
        else:
            s = math.sin(2 * math.pi * freq * t)
        out.append(s * env * vol)
    return out


def mix(*parts):
    """parts: (offset_seconds, samples)"""
    length = max(int(o * RATE) + len(s) for o, s in parts)
    buf = [0.0] * length
    for o, s in parts:
        start = int(o * RATE)
        for i, v in enumerate(s):
            buf[start + i] += v
    peak = max(1e-9, max(abs(v) for v in buf))
    scale = min(1.0, 0.85 / peak)
    return [v * scale for v in buf]


def write(name, samples):
    path = os.path.join(OUT, name)
    with wave.open(path, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(b''.join(struct.pack('<h', int(max(-1, min(1, v)) * 32767)) for v in samples))
    print(name, os.path.getsize(path), 'bytes')


E6, A6, C5, E5, G5, C6 = 1318.5, 1760.0, 523.25, 659.25, 783.99, 1046.5
os.makedirs(OUT, exist_ok=True)
write('correct.wav', mix((0, note(E6, 0.18, 0.45)), (0.09, note(A6, 0.35, 0.5))))
write('wrong.wav', mix((0, note(220, 0.16, 0.5, 'soft')), (0.12, note(174.6, 0.28, 0.5, 'soft'))))
write('complete.wav', mix((0, note(C5, 0.3)), (0.11, note(E5, 0.3)), (0.22, note(G5, 0.3)), (0.33, note(C6, 0.7, 0.6)), (0.33, note(E6, 0.7, 0.25))))
write('tap.wav', note(880, 0.05, 0.35, 'sine', 0.002))
write('start.wav', mix((0, note(660, 0.1, 0.4)), (0.07, note(990, 0.18, 0.45))))
write('stop.wav', mix((0, note(990, 0.1, 0.4)), (0.07, note(660, 0.2, 0.45))))
