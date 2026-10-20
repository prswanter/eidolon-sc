"use client";

import { useEffect, useRef } from "react";

import type { Tones } from "@/lib/liveConversation";

type Sounds = { ring: HTMLAudioElement; connect: HTMLAudioElement; hangUp: HTMLAudioElement };

/**
 * 电话本身的声音（GLOSSARY.md「铃声」「接通音」「挂断音」）的 adapter：建好铃声、接通音、挂断音三个 Audio
 * 元素，交出一个 `tones` port，由 LiveConversation 在拨号、接通、结束和离开页面这几处告诉页面响什么。
 * 它们不是角色的声音，「只看文字」和收起通话层都不影响。铃声等麦克风打开才响，已经不在拨打那一下点击里，
 * 但用户刚点过页面（Chrome 认这个），页面又正在用麦克风（Safari 认这个），一般不会被自动播放策略拦下；
 * 万一被拒就算了，不影响通话，也不用等它响满一遍。
 */
export function useCallTones(): Tones {
  const sounds = useRef<Sounds | null>(null);
  // 这一次铃声真正放出声音的时刻（performance.now()）；还没放出来、或者没在响是 null。
  const ringSince = useRef<number | null>(null);
  const tones = useRef<Tones | null>(null);
  if (tones.current === null)
    tones.current = {
      ring: () => {
        const s = sounds.current;
        if (!s) return;
        // 从真正放出声音时算起：第一次拨号时铃声可能还在加载。
        ringSince.current = null;
        s.ring.addEventListener("playing", () => (ringSince.current = performance.now()), { once: true });
        play(s.ring);
      },
      ringLeft: () => {
        const s = sounds.current;
        // 被拒了的、已经停了的铃声是 paused。
        if (!s || s.ring.paused || !Number.isFinite(s.ring.duration)) return 0;
        const round = s.ring.duration * 1000;
        const since = ringSince.current;
        return since === null ? round : Math.max(0, round - (performance.now() - since));
      },
      connect: () => {
        const s = sounds.current;
        ringSince.current = null;
        if (s) {
          stop(s.ring);
          play(s.connect);
        }
      },
      hangUp: () => {
        const s = sounds.current;
        ringSince.current = null;
        if (s) {
          stop(s.ring);
          play(s.hangUp);
        }
      },
      silence: () => {
        const s = sounds.current;
        ringSince.current = null;
        if (s) stop(s.ring);
      },
    };
  const port = tones.current;

  useEffect(() => {
    const loaded: Sounds = {
      ring: new Audio("/sounds/ringback.mp3"),
      connect: new Audio("/sounds/connect.ogg"),
      hangUp: new Audio("/sounds/hang-up.mp3"),
    };
    loaded.ring.loop = true;
    sounds.current = loaded;
    return () => {
      stop(loaded.ring);
      sounds.current = null;
    };
  }, []);

  return port;
}

function play(audio: HTMLAudioElement): void {
  audio.currentTime = 0;
  audio.play().catch(() => {});
}

function stop(audio: HTMLAudioElement): void {
  audio.pause();
  audio.currentTime = 0;
}
