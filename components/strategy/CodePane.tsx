"use client";

import React from 'react';
import { Code, Download } from 'lucide-react';

interface CodePaneProps {
  code: string;
  language?: string;
  onDownload?: () => void;
}

export function CodePane({ code, language = 'python', onDownload }: CodePaneProps) {
  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
        <div className="flex items-center space-x-2">
          <Code className="w-4 h-4 text-gray-400" />
          <span className="text-sm font-medium text-gray-300">{language}</span>
        </div>

        {onDownload && (
          <button
            onClick={onDownload}
            className="flex items-center space-x-1 px-3 py-1 text-sm text-gray-300 hover:text-white bg-gray-700 hover:bg-gray-600 rounded transition-colors"
          >
            <Download className="w-3 h-3" />
            <span>Download</span>
          </button>
        )}
      </div>

      <div className="p-4">
        <textarea
          value={code}
          readOnly
          aria-label="ML Code"
          className="w-full h-96 px-3 py-2 bg-gray-900 border border-gray-700 rounded text-green-400 font-mono text-sm resize-none focus:outline-none focus:border-blue-500"
          spellCheck={false}
        />
      </div>
    </div>
  );
}
