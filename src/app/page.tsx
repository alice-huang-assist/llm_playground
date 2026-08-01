import ModelPicker from "@/components/ModelPicker";

import styles from "./page.module.css";

export default function Home() {
  return (
    <main className={styles.main}>
      <h1 className={styles.title}>LLM Playground</h1>
      <p className={styles.subtitle}>
        Models discovered across your local runtimes.
      </p>
      <ModelPicker />
    </main>
  );
}
