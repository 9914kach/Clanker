import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Howl, Howler } from "howler";

type HubSoundId = "dock" | "panel" | "confirm" | "chaos";

type HubAudioApi = {
  enabled: boolean;
  setEnabled: (next: boolean) => void;
  toggleEnabled: () => void;
  play: (sound: HubSoundId) => void;
};

type ToneSegment = {
  frequency: number;
  durationMs: number;
  volume?: number;
};

const STORAGE_KEY = "hub.audio.enabled.v1";
const SAMPLE_RATE = 22_050;
const AudioContext = createContext<HubAudioApi | null>(null);

const SOUND_BANK: Record<HubSoundId, readonly ToneSegment[]> = {
  dock: [{ frequency: 600, durationMs: 36, volume: 0.2 }],
  panel: [
    { frequency: 440, durationMs: 42, volume: 0.18 },
    { frequency: 660, durationMs: 52, volume: 0.14 },
  ],
  confirm: [
    { frequency: 523, durationMs: 40, volume: 0.18 },
    { frequency: 659, durationMs: 58, volume: 0.18 },
    { frequency: 784, durationMs: 72, volume: 0.16 },
  ],
  chaos: [
    { frequency: 392, durationMs: 30, volume: 0.16 },
    { frequency: 784, durationMs: 28, volume: 0.18 },
    { frequency: 523, durationMs: 65, volume: 0.14 },
  ],
};

function writeString(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

function encodeTone(segments: readonly ToneSegment[]): string {
  const totalSamples = segments.reduce(
    (sum, segment) => sum + Math.max(1, Math.floor((segment.durationMs / 1000) * SAMPLE_RATE)),
    0,
  );
  const buffer = new ArrayBuffer(44 + totalSamples * 2);
  const view = new DataView(buffer);

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + totalSamples * 2, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, "data");
  view.setUint32(40, totalSamples * 2, true);

  let sampleOffset = 44;
  for (const segment of segments) {
    const sampleCount = Math.max(1, Math.floor((segment.durationMs / 1000) * SAMPLE_RATE));
    const volume = Math.max(0, Math.min(segment.volume ?? 0.16, 0.5));
    for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
      const envelope = 1 - sampleIndex / sampleCount;
      const sample =
        Math.sin((2 * Math.PI * segment.frequency * sampleIndex) / SAMPLE_RATE) *
        volume *
        envelope;
      view.setInt16(sampleOffset, sample * 0x7fff, true);
      sampleOffset += 2;
    }
  }

  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const value of bytes) {
    binary += String.fromCharCode(value);
  }

  return `data:audio/wav;base64,${btoa(binary)}`;
}

export function HubAudioProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabledState] = useState<boolean>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? raw === "1" : true;
    } catch {
      return true;
    }
  });
  const howlsRef = useRef<Partial<Record<HubSoundId, Howl>>>({});
  const encodedBank = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(SOUND_BANK).map(([key, segments]) => [key, encodeTone(segments)]),
      ) as Record<HubSoundId, string>,
    [],
  );

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
    } catch {
      // ignore storage failures
    }
    Howler.volume(enabled ? 0.7 : 0);
  }, [enabled]);

  const setEnabled = useCallback((next: boolean) => {
    setEnabledState(next);
  }, []);

  const toggleEnabled = useCallback(() => {
    setEnabledState((prev) => !prev);
  }, []);

  const play = useCallback(
    (sound: HubSoundId) => {
      if (!enabled) {
        return;
      }

      const existing = howlsRef.current[sound];
      if (existing) {
        existing.stop();
        existing.play();
        return;
      }

      const howl = new Howl({
        src: [encodedBank[sound]],
        preload: true,
        html5: false,
        volume: 1,
      });
      howlsRef.current[sound] = howl;
      howl.play();
    },
    [enabled, encodedBank],
  );

  const value = useMemo<HubAudioApi>(
    () => ({
      enabled,
      setEnabled,
      toggleEnabled,
      play,
    }),
    [enabled, play, setEnabled, toggleEnabled],
  );

  return <AudioContext.Provider value={value}>{children}</AudioContext.Provider>;
}

export function useHubAudio() {
  const context = useContext(AudioContext);
  if (!context) {
    throw new Error("useHubAudio must be used within HubAudioProvider");
  }
  return context;
}
