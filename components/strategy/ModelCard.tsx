"use client";

import React from 'react';
import { Brain, Info } from 'lucide-react';

interface ModelCardProps {
  modelType: string;
  summary: {
    purpose: string;
    notes?: string;
  };
}

export function ModelCard({ modelType, summary }: ModelCardProps) {
  return (
    <div className="bg-gradient-to-r from-purple-900/30 to-blue-900/30 border border-purple-500/50 rounded-lg p-6">
      <div className="flex items-start space-x-4">
        <div className="flex-shrink-0">
          <div className="w-12 h-12 bg-purple-600 rounded-lg flex items-center justify-center">
            <Brain className="w-6 h-6 text-white" />
          </div>
        </div>

        <div className="flex-1">
          <h3 className="text-xl font-semibold text-white mb-2">
            {modelType}
          </h3>

          <div className="space-y-2">
            <div className="flex items-start space-x-2">
              <Info className="w-4 h-4 text-purple-400 mt-0.5 flex-shrink-0" />
              <p className="text-gray-300 text-sm">
                {summary.purpose}
              </p>
            </div>

            {summary.notes && (
              <p className="text-gray-400 text-sm italic pl-6">
                {summary.notes}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
