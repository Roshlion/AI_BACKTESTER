"use client";

import React from 'react';
import { clampValue } from '@/lib/template';

interface UISchemaField {
  type: 'number' | 'select' | 'text';
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
  help?: string;
}

interface HyperparamFormProps {
  hyperparams: Record<string, any>;
  uiSchema: Record<string, UISchemaField>;
  onChange: (key: string, value: any) => void;
  errors?: Record<string, string>;
}

export function HyperparamForm({
  hyperparams,
  uiSchema,
  onChange,
  errors = {},
}: HyperparamFormProps) {
  const handleNumberChange = (key: string, rawValue: string, schema: UISchemaField) => {
    const numValue = parseFloat(rawValue);

    if (isNaN(numValue)) {
      onChange(key, rawValue); // Let validation handle it
      return;
    }

    // Clamp to valid range
    const clamped = clampValue(numValue, {
      min: schema.min,
      max: schema.max,
      step: schema.step,
    });

    onChange(key, clamped);
  };

  return (
    <div className="space-y-4">
      <h4 className="text-lg font-semibold text-white">Hyperparameters</h4>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Object.keys(uiSchema).map((key) => {
          const schema = uiSchema[key];
          const value = hyperparams[key];
          const error = errors[key];

          return (
            <div key={key} className="space-y-2">
              <label htmlFor={`hyperparam-${key}`} className="block text-sm font-medium text-gray-300">
                {key.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
              </label>

              {schema.type === 'number' && (
                <div className="space-y-1">
                  <input
                    id={`hyperparam-${key}`}
                    type="number"
                    value={value}
                    onChange={(e) => handleNumberChange(key, e.target.value, schema)}
                    min={schema.min}
                    max={schema.max}
                    step={schema.step}
                    className={`w-full px-3 py-2 bg-gray-700 border ${
                      error ? 'border-red-500' : 'border-gray-600'
                    } rounded text-white focus:outline-none focus:border-blue-500`}
                    aria-label={key}
                  />
                  {schema.help && (
                    <p className="text-xs text-gray-400">{schema.help}</p>
                  )}
                  {schema.min !== undefined && schema.max !== undefined && (
                    <p className="text-xs text-gray-500">
                      Range: {schema.min} - {schema.max}
                    </p>
                  )}
                </div>
              )}

              {schema.type === 'select' && schema.options && (
                <div className="space-y-1">
                  <select
                    id={`hyperparam-${key}`}
                    value={value}
                    onChange={(e) => onChange(key, e.target.value)}
                    className={`w-full px-3 py-2 bg-gray-700 border ${
                      error ? 'border-red-500' : 'border-gray-600'
                    } rounded text-white focus:outline-none focus:border-blue-500`}
                    aria-label={key}
                  >
                    {schema.options.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                  {schema.help && (
                    <p className="text-xs text-gray-400">{schema.help}</p>
                  )}
                </div>
              )}

              {schema.type === 'text' && (
                <div className="space-y-1">
                  <input
                    id={`hyperparam-${key}`}
                    type="text"
                    value={value}
                    onChange={(e) => onChange(key, e.target.value)}
                    className={`w-full px-3 py-2 bg-gray-700 border ${
                      error ? 'border-red-500' : 'border-gray-600'
                    } rounded text-white focus:outline-none focus:border-blue-500`}
                    aria-label={key}
                  />
                  {schema.help && (
                    <p className="text-xs text-gray-400">{schema.help}</p>
                  )}
                </div>
              )}

              {error && (
                <p className="text-xs text-red-400">{error}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
