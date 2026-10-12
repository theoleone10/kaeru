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
        elif shape == 'marimba':  # woody: fundamental plus a quickly dying 4th partial
            s = math.sin(2 * math.pi * freq * t) + 0.5 * math.sin(2 * math.pi * freq * 4 * t) * math.exp(-t * 40)
            env = min(1.0, t / attack) * math.exp(-t * 9)
        elif shape == 'soft':  # rounded square: a gentle "bonk"
            s = math.tanh(3 * math.sin(2 * math.pi * freq * t)) * 0.6
        else:
            s = math.sin(2 * math.pi * freq * t)
        out.append(s * env * vol)
    return out


def glide(f0, f1, dur, vol=0.5, curve=2.0):
    """A pitch sweep: a bubble pop when short, a frog hop "boing" when longer."""
    n = int(RATE * dur)
    out, phase = [], 0.0
    for i in range(n):
        x = i / n
        f = f0 + (f1 - f0) * (1 - (1 - x) ** curve)
        phase += 2 * math.pi * f / RATE
        env = min(1.0, i / (RATE * 0.004)) * (1 - x) ** 1.5
        out.append(math.sin(phase) * env * vol)
    return out


def sparkle(start, freqs, gap=0.045, vol=0.22):
    """A quick glittery run of little bells."""
    return [(start + i * gap, note(f, 0.35, vol)) for i, f in enumerate(freqs)]


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

# Cute & bubbly: marimba, bubble pops and frog hops.
G5, A5, D6, G6, C7 = 783.99, 880.0, 1174.66, 1567.98, 2093.0
M = 'marimba'
write('button.wav', glide(420, 1100, 0.07, 0.32, 3))
write('lesson.wav', mix(
    (0, note(C5, 0.4, 0.5, M)), (0.09, note(E5, 0.4, 0.5, M)), (0.18, note(G5, 0.4, 0.5, M)),
    (0.30, note(C6, 0.8, 0.55, M)), (0.30, note(E6, 0.8, 0.2)),
    (0.55, glide(500, 1300, 0.16, 0.3)),
))
write('reviews.wav', mix(
    *sparkle(0, [G5, A5, C6, D6, E6, G6]),
    (0.30, note(C6, 0.9, 0.4)), (0.30, note(E6, 0.9, 0.25)), (0.30, note(G6, 0.9, 0.2)),
))
write('deck.wav', mix(
    (0, glide(600, 1200, 0.05, 0.3)), (0.07, glide(700, 1400, 0.05, 0.3)),
    (0.16, note(G5, 0.5, 0.45, M)), (0.26, note(C6, 0.7, 0.5, M)), (0.26, note(G6, 0.7, 0.18)),
))
write('goal.wav', mix(
    (0, note(G5, 0.18, 0.45, M)), (0.12, note(C6, 0.7, 0.55, M)),
    *sparkle(0.2, [E6, G6, C7], 0.05, 0.18),
))
write('streak.wav', mix(
    (0, glide(300, 700, 0.14, 0.4)), (0.18, glide(400, 900, 0.14, 0.4)), (0.36, glide(500, 1200, 0.18, 0.45)),
    (0.55, note(C6, 0.9, 0.4)), (0.55, note(E6, 0.9, 0.3)), (0.55, note(G6, 0.9, 0.22)),
    *sparkle(0.6, [C7, G6, C7], 0.06, 0.12),
))
write('daydone.wav', mix(
    (0, note(C5, 0.3, 0.5, M)), (0.1, note(E5, 0.3, 0.5, M)), (0.2, note(G5, 0.45, 0.5, M)),
    (0.38, note(E5, 0.3, 0.5, M)), (0.48, note(G5, 0.3, 0.5, M)), (0.58, note(C6, 0.45, 0.5, M)),
    (0.78, note(C5, 1.2, 0.35)), (0.78, note(E5, 1.2, 0.3)), (0.78, note(G5, 1.2, 0.3)), (0.78, note(C6, 1.2, 0.4)),
    (0.80, glide(500, 1400, 0.2, 0.25)),
    *sparkle(0.9, [E6, G6, C7, G6, C7], 0.05, 0.12),
))
write('level.wav', mix(
    (0, note(C5, 0.3, 0.5, M)), (0.08, note(E5, 0.3, 0.5, M)), (0.16, note(G5, 0.3, 0.5, M)), (0.24, note(C6, 0.3, 0.5, M)),
    (0.36, note(E5, 0.3, 0.5, M)), (0.44, note(G5, 0.3, 0.5, M)), (0.52, note(C6, 0.3, 0.5, M)), (0.60, note(E6, 0.4, 0.5, M)),
    (0.78, note(C5, 1.5, 0.3)), (0.78, note(G5, 1.5, 0.3)), (0.78, note(C6, 1.5, 0.35)), (0.78, note(E6, 1.5, 0.3)), (0.78, note(G6, 1.5, 0.2)),
    (0.70, glide(300, 700, 0.12, 0.3)), (0.84, glide(450, 1100, 0.14, 0.3)),
    *sparkle(1.0, [C7, G6, E6, G6, C7], 0.06, 0.12),
))
