"use client";

import { useCallback, useState } from "react";

import ModelInstaller from "@/components/ModelInstaller";
import ModelPicker from "@/components/ModelPicker";
import { OLLAMA_PROVIDER_ID } from "@/lib/providers/ollama";
import type { ProviderModels } from "@/lib/providers/types";

import styles from "./page.module.css";

export default function Home() {
  const [reloadToken, setReloadToken] = useState(0);
  const [ollamaReachable, setOllamaReachable] = useState(false);

  const handleLoad = useCallback((providers: ProviderModels[]) => {
    setOllamaReachable(
      providers.some(
        (provider) =>
          provider.providerId === OLLAMA_PROVIDER_ID && provider.reachable,
      ),
    );
  }, []);

  return (
    <main className={styles.main}>
      <h1 className={styles.title}>LLM Playground</h1>
      <p className={styles.subtitle}>
        Models discovered across your local runtimes.
      </p>
      <ModelPicker reloadToken={reloadToken} onLoad={handleLoad} />
      <ModelInstaller
        available={ollamaReachable}
        onInstalled={() => setReloadToken((token) => token + 1)}
      />
    </main>
  );
}
