import React, { useState, useEffect } from "react";
import { LLMClient, NetworkError, LLMAPIError } from "../core/LLMClient";
import { Model } from "../types";
import { Select } from "./ui/Select";
import { Button } from "./ui/Button";

interface ModelSelectorProps {
  baseUrl: string;
  apiKey: string;
  proxy?: string;
  selectedModel: string;
  onModelChange: (model: string) => void;
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({
  baseUrl,
  apiKey,
  proxy,
  selectedModel,
  onModelChange,
}) => {
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchModels = async () => {
    if (!baseUrl || !apiKey) {
      setError("Base URL and API Key are required");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const client = new LLMClient(baseUrl, apiKey, proxy);
      const fetchedModels = await client.fetchModels();
      setModels(fetchedModels);
      
      if (fetchedModels.length > 0 && !selectedModel) {
        onModelChange(fetchedModels[0].id);
      }
    } catch (err) {
      if (err instanceof NetworkError || err instanceof LLMAPIError) {
        setError(err.message);
      } else {
        setError("Failed to fetch models");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (baseUrl && apiKey) {
      fetchModels();
    }
  }, [baseUrl, apiKey, proxy]);

  const options = models.map((model) => ({
    value: model.id,
    label: model.name || model.id,
  }));

  return (
    <div className="sgr-model-selector">
      <div className="sgr-model-selector-row">
        <Select
          options={options.length > 0 ? options : [{ value: selectedModel || "", label: selectedModel || "No models" }]}
          value={selectedModel}
          onChange={(e) => onModelChange(e.target.value)}
          disabled={loading || options.length === 0}
        />
        <Button
          variant="secondary"
          size="sm"
          onClick={fetchModels}
          disabled={loading || !baseUrl || !apiKey}
        >
          {loading ? "Loading..." : "Refresh"}
        </Button>
      </div>
      {error && <div className="sgr-error">{error}</div>}
    </div>
  );
};
