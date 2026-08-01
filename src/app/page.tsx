"use client";

import { useState } from "react";

import Chat from "@/components/Chat";
import ModelPicker from "@/components/ModelPicker";
import type { Model } from "@/lib/providers/types";

import styles from "./page.module.css";

export default function Home() {
  const [model, setModel] = useState<Model | null>(null);

  return (
    <main className={styles.main}>
      <h1 className={styles.title}>LLM Playground</h1>
      <p className={styles.subtitle}>
        Models discovered across your local runtimes.
      </p>
      <ModelPicker onChange={setModel} />
      <Chat model={model} />
    </main>
  );
}
