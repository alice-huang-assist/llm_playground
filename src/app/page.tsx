"use client";

import { useCallback, useState } from "react";

import Chat from "@/components/Chat";
import ModelInstaller from "@/components/ModelInstaller";
import ModelPicker from "@/components/ModelPicker";
import ParameterSidebar from "@/components/ParameterSidebar";
import { DEFAULT_PARAMETERS, type ParameterValues } from "@/lib/params";
import { OLLAMA_PROVIDER_ID } from "@/lib/providers/ollama";
import type { Model, ProviderModels } from "@/lib/providers/types";

import styles from "./page.module.css";

export default function Home() {
  const [model, setModel] = useState<Model | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [ollamaReachable, setOllamaReachable] = useState(false);
  const [parameters, setParameters] = useState<ParameterValues>({
    ...DEFAULT_PARAMETERS,
  });

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

      <div className={styles.layout}>
        <div className={styles.column}>
          <ModelPicker
            reloadToken={reloadToken}
            onChange={setModel}
            onLoad={handleLoad}
          />
          <ModelInstaller
            available={ollamaReachable}
            onInstalled={() => setReloadToken((token) => token + 1)}
          />
          <Chat model={model} parameters={parameters} />
        </div>

        <ParameterSidebar values={parameters} onChange={setParameters} />
      </div>
    </main>
  );
}
