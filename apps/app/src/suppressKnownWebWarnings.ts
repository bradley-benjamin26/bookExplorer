import { Platform } from "react-native";

/**
 * react-native-svg's web renderer always attaches its legacy touch-responder
 * shim (onStartShouldSetResponder, onResponderGrant, etc.) to any shape with
 * an `onPress` handler, in addition to translating `onPress` into a real
 * `onClick`. Those responder props aren't valid DOM event attributes, so
 * React logs an "Unknown event handler property" warning for each one on
 * every render — harmless (the real click handling goes through `onClick`
 * regardless), but noisy. This filters only that exact message; everything
 * else still reaches the console normally.
 */
if (Platform.OS === "web") {
  const originalError = console.error;
  console.error = (...args: unknown[]) => {
    if (typeof args[0] === "string" && args[0].includes("Unknown event handler property")) return;
    originalError(...args);
  };
}
