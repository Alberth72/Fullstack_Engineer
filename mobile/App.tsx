import { useEffect, useState } from "react";
import { ActivityIndicator, SafeAreaView, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import "./src/background/locationTask";
import "./src/background/geofenceTask";
import { createMobileEnvironment, type MobileEnvironment } from "./src/app/createMobileEnvironment";
import { SyncStatusScreen } from "./src/ui/SyncStatusScreen";

export default function App() {
  const [environment, setEnvironment] = useState<MobileEnvironment | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    void createMobileEnvironment({ useMemoryFallback: true })
      .then((nextEnvironment) => {
        if (mounted) {
          setEnvironment(nextEnvironment);
        }
      })
      .catch((err) => {
        if (mounted) {
          setError(err instanceof Error ? err.message : "mobile_environment_error");
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      {environment ? (
        <SyncStatusScreen environment={environment} />
      ) : (
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingTitle}>Inicializando app del conductor</Text>
          {error ? <Text style={styles.errorText}>{error}</Text> : <ActivityIndicator size="large" color="#8c5a2b" />}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f2f4f7",
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 16,
    backgroundColor: "#f2f4f7",
  },
  loadingTitle: {
    color: "#182230",
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
  },
  errorText: {
    color: "#b42318",
    fontSize: 14,
    textAlign: "center",
  },
});
