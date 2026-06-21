/**
 * AliveAvatar — brings the awakened object's portrait to life. The whole portrait
 * (not a face overlay) gently moves with an archetype-specific idle "breath", and
 * shifts into a livelier "talking" motion while the spirit is speaking.
 *
 * Procedural (react-native Animated, native-driver transforms only) so it works
 * immediately with the AI portrait — no design assets, no new native deps. The
 * motion vocabulary per archetype mirrors the design brief:
 *
 *   grumpy_elder          idle: slow slump sway     talking: grumbling shake
 *   dramatic_diva         idle: regal sway          talking: sweeping sway + pulse
 *   deadpan_stoic         idle: near-still breath    talking: minimal bob
 *   anxious_overachiever  idle: rapid subtle fidget  talking: fast jitter
 *
 * Drive it from the existing speaking signals: speakingIdx on the reveal card,
 * agent-speaking status in the conversation screen.
 */
import { useEffect, useRef } from "react";
import { Animated, type ImageStyle, type StyleProp } from "react-native";

type Motion = {
  x?: number; // translateX amplitude (px)
  y?: number; // translateY amplitude (px)
  r?: number; // rotation amplitude (deg)
  s?: number; // scale amplitude (± from 1)
  jitter?: number; // if set, random fidget of this amplitude (px) instead of a smooth wave
  period: number; // ms per half-cycle (smooth) or per jitter step
};

function motionFor(archetype: string, speaking: boolean): Motion {
  switch (archetype) {
    case "dramatic_diva":
      return speaking
        ? { x: 6, r: 4, s: 0.04, period: 380 }
        : { x: 4, r: 2.5, s: 0.015, period: 2300 };
    case "deadpan_stoic":
      return speaking
        ? { y: 1.5, s: 0.006, period: 320 }
        : { s: 0.006, period: 4000 };
    case "anxious_overachiever":
      return speaking
        ? { jitter: 2.6, period: 70 }
        : { jitter: 1.2, period: 130 };
    case "grumpy_elder":
      return speaking
        ? { y: 2, r: 1.6, period: 200 }
        : { y: 3, r: 1.4, period: 2600 };
    default:
      // Any other archetype → gentle, neutral life so it's never dead-still.
      return speaking
        ? { y: 2, r: 1.5, s: 0.02, period: 300 }
        : { y: 2, r: 1, s: 0.01, period: 2600 };
  }
}

export function AliveAvatar({
  portraitUrl,
  archetype,
  speaking,
  style,
  resizeMode = "cover",
}: {
  portraitUrl: string;
  archetype: string;
  speaking: boolean;
  style?: StyleProp<ImageStyle>;
  resizeMode?: "cover" | "contain" | "stretch" | "center";
}) {
  const osc = useRef(new Animated.Value(0)).current; // smooth oscillator, -1..1
  const jx = useRef(new Animated.Value(0)).current; // jitter X
  const jy = useRef(new Animated.Value(0)).current; // jitter Y

  const m = motionFor(archetype, speaking);
  const jitter = m.jitter;

  useEffect(() => {
    let alive = true;

    if (jitter) {
      osc.setValue(0);
      const step = () => {
        if (!alive) return;
        Animated.parallel([
          Animated.timing(jx, {
            toValue: (Math.random() - 0.5) * 2 * jitter,
            duration: m.period,
            useNativeDriver: true,
          }),
          Animated.timing(jy, {
            toValue: (Math.random() - 0.5) * 2 * jitter,
            duration: m.period,
            useNativeDriver: true,
          }),
        ]).start(({ finished }) => {
          if (alive && finished) step();
        });
      };
      step();
      return () => {
        alive = false;
        jx.stopAnimation();
        jy.stopAnimation();
        Animated.timing(jx, { toValue: 0, duration: 160, useNativeDriver: true }).start();
        Animated.timing(jy, { toValue: 0, duration: 160, useNativeDriver: true }).start();
      };
    }

    // Smooth wave: oscillate -1 → 1 → -1 forever.
    jx.setValue(0);
    jy.setValue(0);
    osc.setValue(0);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(osc, { toValue: 1, duration: m.period, useNativeDriver: true }),
        Animated.timing(osc, { toValue: -1, duration: m.period, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => {
      alive = false;
      loop.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [archetype, speaking, jitter, m.period]);

  const transform = jitter
    ? [{ translateX: jx }, { translateY: jy }]
    : [
        { translateX: osc.interpolate({ inputRange: [-1, 1], outputRange: [-(m.x ?? 0), m.x ?? 0] }) },
        { translateY: osc.interpolate({ inputRange: [-1, 1], outputRange: [-(m.y ?? 0), m.y ?? 0] }) },
        { rotate: osc.interpolate({ inputRange: [-1, 1], outputRange: [`-${m.r ?? 0}deg`, `${m.r ?? 0}deg`] }) },
        { scale: osc.interpolate({ inputRange: [-1, 1], outputRange: [1 - (m.s ?? 0), 1 + (m.s ?? 0)] }) },
      ];

  return (
    <Animated.Image
      source={{ uri: portraitUrl }}
      style={[style, { transform }]}
      resizeMode={resizeMode}
    />
  );
}
