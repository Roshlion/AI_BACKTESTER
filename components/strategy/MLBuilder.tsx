"use client";

import { useState } from "react";
import { Code2, Settings } from "lucide-react";

export type MLModelType =
  | "LogisticRegression"
  | "Ridge"
  | "Lasso"
  | "ElasticNet"
  | "DecisionTreeClassifier"
  | "DecisionTreeRegressor"
  | "RandomForestClassifier"
  | "RandomForestRegressor"
  | "ExtraTreesClassifier"
  | "ExtraTreesRegressor"
  | "XGBClassifier"
  | "XGBRegressor"
  | "LGBMClassifier"
  | "LGBMRegressor"
  | "CatBoostClassifier"
  | "CatBoostRegressor"
  | "SVC"
  | "SVR"
  | "KNeighborsClassifier"
  | "KNeighborsRegressor"
  | "MLPClassifier"
  | "MLPRegressor";

export interface MLConfig {
  modelType: MLModelType;
  hyperparams: Record<string, any>;
  code: string;
  customMode: boolean;
}

interface MLBuilderProps {
  value: MLConfig;
  onChange: (config: MLConfig) => void;
}

const MODEL_CATEGORIES = {
  "Linear Models": ["LogisticRegression", "Ridge", "Lasso", "ElasticNet"],
  "Tree Models": [
    "DecisionTreeClassifier",
    "DecisionTreeRegressor",
    "RandomForestClassifier",
    "RandomForestRegressor",
    "ExtraTreesClassifier",
    "ExtraTreesRegressor",
  ],
  "Gradient Boosting": [
    "XGBClassifier",
    "XGBRegressor",
    "LGBMClassifier",
    "LGBMRegressor",
    "CatBoostClassifier",
    "CatBoostRegressor",
  ],
  "SVM & KNN": ["SVC", "SVR", "KNeighborsClassifier", "KNeighborsRegressor"],
  "Neural Networks": ["MLPClassifier", "MLPRegressor"],
};

const DEFAULT_HYPERPARAMS: Record<MLModelType, Record<string, any>> = {
  LogisticRegression: { C: 1.0, max_iter: 100 },
  Ridge: { alpha: 1.0 },
  Lasso: { alpha: 1.0 },
  ElasticNet: { alpha: 1.0, l1_ratio: 0.5 },
  DecisionTreeClassifier: { max_depth: 5, min_samples_split: 2 },
  DecisionTreeRegressor: { max_depth: 5, min_samples_split: 2 },
  RandomForestClassifier: { n_estimators: 100, max_depth: 10, min_samples_split: 2 },
  RandomForestRegressor: { n_estimators: 100, max_depth: 10, min_samples_split: 2 },
  ExtraTreesClassifier: { n_estimators: 100, max_depth: 10 },
  ExtraTreesRegressor: { n_estimators: 100, max_depth: 10 },
  XGBClassifier: { n_estimators: 100, max_depth: 6, learning_rate: 0.1 },
  XGBRegressor: { n_estimators: 100, max_depth: 6, learning_rate: 0.1 },
  LGBMClassifier: { n_estimators: 100, max_depth: -1, learning_rate: 0.1 },
  LGBMRegressor: { n_estimators: 100, max_depth: -1, learning_rate: 0.1 },
  CatBoostClassifier: { iterations: 100, depth: 6, learning_rate: 0.1 },
  CatBoostRegressor: { iterations: 100, depth: 6, learning_rate: 0.1 },
  SVC: { C: 1.0, kernel: "rbf" },
  SVR: { C: 1.0, kernel: "rbf" },
  KNeighborsClassifier: { n_neighbors: 5 },
  KNeighborsRegressor: { n_neighbors: 5 },
  MLPClassifier: { hidden_layer_sizes: [100], max_iter: 200, alpha: 0.0001 },
  MLPRegressor: { hidden_layer_sizes: [100], max_iter: 200, alpha: 0.0001 },
};

export function MLBuilder({ value, onChange }: MLBuilderProps) {
  const [showCode, setShowCode] = useState(false);

  const updateField = <K extends keyof MLConfig>(key: K, val: MLConfig[K]) => {
    onChange({ ...value, [key]: val });
  };

  const updateHyperparam = (key: string, val: any) => {
    onChange({
      ...value,
      hyperparams: { ...value.hyperparams, [key]: val },
    });
  };

  const changeModel = (modelType: MLModelType) => {
    onChange({
      ...value,
      modelType,
      hyperparams: { ...DEFAULT_HYPERPARAMS[modelType] },
      customMode: false,
    });
  };

  const toggleCodeEditor = () => {
    setShowCode(!showCode);
    if (!showCode && !value.customMode) {
      // First time opening code editor - mark as custom mode
      updateField("customMode", true);
    }
  };

  return (
    <div className="space-y-4">
      {/* Model Selection */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">Model Type</label>
        <div className="space-y-3">
          {Object.entries(MODEL_CATEGORIES).map(([category, models]) => (
            <div key={category}>
              <h4 className="text-xs font-medium text-gray-400 mb-2">{category}</h4>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                {models.map((model) => (
                  <button
                    key={model}
                    type="button"
                    onClick={() => changeModel(model as MLModelType)}
                    className={`px-3 py-2 text-xs rounded border transition-colors text-left ${
                      value.modelType === model
                        ? "border-purple-500 bg-purple-500/10 text-white"
                        : "border-gray-600 bg-gray-700 text-gray-300 hover:border-gray-500"
                    }`}
                  >
                    {model}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Hyperparameters */}
      {!value.customMode && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Settings className="w-4 h-4 text-blue-400" />
            <label className="block text-sm font-medium text-gray-300">Hyperparameters</label>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {Object.entries(value.hyperparams).map(([key, val]) => (
              <div key={key}>
                <label className="block text-xs text-gray-400 mb-1 capitalize">
                  {key.replace(/_/g, " ")}
                </label>
                {typeof val === "boolean" ? (
                  <input
                    type="checkbox"
                    checked={val}
                    onChange={(e) => updateHyperparam(key, e.target.checked)}
                    className="w-4 h-4"
                  />
                ) : typeof val === "number" ? (
                  <input
                    type="number"
                    step="any"
                    value={val}
                    onChange={(e) => updateHyperparam(key, Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm bg-gray-700 border border-gray-600 rounded text-white"
                  />
                ) : Array.isArray(val) ? (
                  <input
                    type="text"
                    value={JSON.stringify(val)}
                    onChange={(e) => {
                      try {
                        updateHyperparam(key, JSON.parse(e.target.value));
                      } catch {
                        // Invalid JSON, ignore
                      }
                    }}
                    className="w-full px-3 py-2 text-sm bg-gray-700 border border-gray-600 rounded text-white"
                  />
                ) : (
                  <input
                    type="text"
                    value={String(val)}
                    onChange={(e) => updateHyperparam(key, e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-gray-700 border border-gray-600 rounded text-white"
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Code Editor Toggle */}
      <div>
        <button
          type="button"
          onClick={toggleCodeEditor}
          className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-650 border border-gray-600 rounded text-white transition-colors"
        >
          <Code2 className="w-4 h-4" />
          {showCode ? "Hide" : "Show"} Python Code
          {value.customMode && <span className="text-xs text-yellow-400">(Custom)</span>}
        </button>
      </div>

      {/* Code Editor */}
      {showCode && (
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Python Code
            <span className="text-xs text-gray-400 ml-2">
              (Edit to customize; will mark as custom mode)
            </span>
          </label>
          <textarea
            value={value.code}
            onChange={(e) => {
              updateField("code", e.target.value);
              if (!value.customMode) updateField("customMode", true);
            }}
            rows={20}
            className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded text-green-400 font-mono text-sm focus:outline-none focus:border-purple-500"
            placeholder="# Python ML strategy code..."
            spellCheck={false}
          />
          <p className="text-xs text-gray-400 mt-2">
            Code should read OHLCV data, train a model, generate predictions, and output JSON results.
          </p>
        </div>
      )}

      {/* Training Window */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Training Window (days)
        </label>
        <input
          type="number"
          value={(value.hyperparams as any).train_window ?? 252}
          onChange={(e) => updateHyperparam("train_window", Number(e.target.value))}
          className="w-full px-3 py-2 text-sm bg-gray-700 border border-gray-600 rounded text-white"
          placeholder="252"
        />
        <p className="text-xs text-gray-400 mt-1">
          Number of historical days to use for training the model
        </p>
      </div>
    </div>
  );
}
