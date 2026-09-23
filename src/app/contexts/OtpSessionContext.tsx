import { createContext, useContext, useState, useRef, ReactNode } from 'react';

export type OtpStatus = 'idle' | 'waiting' | 'received';

interface OtpSessionContextValue {
  otpStatus: OtpStatus;
  setOtpStatus: (status: OtpStatus) => void;
}

const OtpSessionContext = createContext<OtpSessionContextValue>({
  otpStatus: 'idle',
  setOtpStatus: () => {},
});

// ─── Notification sound (Web Audio API) ──────────────────────────────────────
// Plays a pleasant 3-note ascending chime: A5 → C#6 → E6 (A major arpeggio)
function playOtpNotification() {
  try {
    const AudioCtx =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    const playNote = (
      freq: number,
      startOffset: number,
      duration: number,
      volume = 0.28,
    ) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.type            = 'sine';
      osc.frequency.value = freq;

      const t = ctx.currentTime + startOffset;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(volume, t + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

      osc.start(t);
      osc.stop(t + duration + 0.05);
    };

    // Three notes, slightly overlapping for a warm chime feel
    playNote(880,  0.00, 0.38);   // A5
    playNote(1108, 0.18, 0.42);   // C#6
    playNote(1318, 0.36, 0.60);   // E6
  } catch {
    // AudioContext unavailable (e.g. SSR / sandboxed iframe) — fail silently
  }
}

// ─── Provider ─────────────────────────────────────────────────────────────────
export function OtpSessionProvider({ children }: { children: ReactNode }) {
  const [otpStatus, setOtpStatusState] = useState<OtpStatus>('idle');
  const prevStatus = useRef<OtpStatus>('idle');

  const setOtpStatus = (status: OtpStatus) => {
    // Fire sound exactly once on the idle→waiting→received transition
    if (status === 'received' && prevStatus.current !== 'received') {
      playOtpNotification();
    }
    prevStatus.current = status;
    setOtpStatusState(status);
  };

  return (
    <OtpSessionContext.Provider value={{ otpStatus, setOtpStatus }}>
      {children}
    </OtpSessionContext.Provider>
  );
}

export const useOtpSession = () => useContext(OtpSessionContext);
