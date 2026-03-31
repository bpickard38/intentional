import React, { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";

interface Props {
  loading: boolean;
  label?: string;
}

/**
 * Full-width button-shaped progress bar.
 * Replaces the action button while loading — shows one clear indicator.
 */
export function StudyProgressBar({ loading, label }: Props) {
  const progress = useRef(new Animated.Value(0)).current;
  const [visible, setVisible] = useState(false);
  const animRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (loading) {
      setVisible(true);
      progress.setValue(0);
      if (animRef.current) animRef.current.stop();
      animRef.current = Animated.timing(progress, {
        toValue: 0.88,
        duration: 22000,
        useNativeDriver: false,
      });
      animRef.current.start();
    } else if (visible) {
      if (animRef.current) animRef.current.stop();
      animRef.current = Animated.timing(progress, {
        toValue: 1,
        duration: 300,
        useNativeDriver: false,
      });
      animRef.current.start(({ finished }) => {
        if (finished) {
          setTimeout(() => {
            progress.setValue(0);
            setVisible(false);
          }, 380);
        }
      });
    }
  }, [loading]);

  if (!visible) return null;

  const fillWidth = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.fill, { width: fillWidth }]} />
      <Text style={styles.label}>{label ?? "Loading…"}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 50,
    borderRadius: 14,
    backgroundColor: "#deedf5",
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "center",
    marginVertical: 4,
  },
  fill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "#0a7ea4",
    borderRadius: 14,
  },
  label: {
    fontSize: 15,
    fontWeight: "700",
    color: "#fff",
    zIndex: 1,
  },
});
