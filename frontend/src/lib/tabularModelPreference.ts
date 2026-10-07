"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ALLOWED_MODEL_IDS,
  DEFAULT_MODEL_ID,
} from "@/app/components/assistant/ModelToggle";

const STORAGE_KEY = "capscreen_tabular_model";

export function getTabularModelPreference(): string {
  if (typeof window === "undefined") return DEFAULT_MODEL_ID;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored && ALLOWED_MODEL_IDS.has(stored)) return stored;
  return DEFAULT_MODEL_ID;
}

export function setTabularModelPreference(modelId: string): void {
  if (!ALLOWED_MODEL_IDS.has(modelId)) return;
  localStorage.setItem(STORAGE_KEY, modelId);
}

export function useTabularModelPreference(): [
  string,
  (modelId: string) => void,
] {
  const [model, setModel] = useState(DEFAULT_MODEL_ID);

  useEffect(() => {
    setModel(getTabularModelPreference());
  }, []);

  const updateModel = useCallback((modelId: string) => {
    setTabularModelPreference(modelId);
    setModel(modelId);
  }, []);

  return [model, updateModel];
}
