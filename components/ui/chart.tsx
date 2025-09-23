"use client";

import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";

interface ChartData {
  date: string;
  close: number;
  open?: number;
  high?: number;
  low?: number;
  volume?: number;
}

interface LineChartProps {
  data: ChartData[];
  title?: string;
}

export function PriceLineChart({ data, title }: LineChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center border rounded bg-gray-900">
        <p className="text-gray-400">No data available</p>
      </div>
    );
  }

  return (
    <div className="w-full">
      {title && <h3 className="text-lg font-semibold mb-2 text-white">{title}</h3>}
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis
            dataKey="date"
            stroke="#9CA3AF"
            fontSize={12}
            tickFormatter={(value) => new Date(value).toLocaleDateString()}
          />
          <YAxis
            stroke="#9CA3AF"
            fontSize={12}
            tickFormatter={(value) => `$${value.toFixed(2)}`}
          />
          <Tooltip
            labelFormatter={(value) => new Date(value).toLocaleDateString()}
            formatter={(value: any) => [`$${Number(value).toFixed(2)}`, "Close"]}
            contentStyle={{
              backgroundColor: "#1F2937",
              border: "1px solid #374151",
              borderRadius: "6px",
              color: "#F9FAFB"
            }}
          />
          <Line
            type="monotone"
            dataKey="close"
            stroke="#3B82F6"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

interface EquityChartProps {
  data: number[];
  title?: string;
}

export function EquityChart({ data, title }: EquityChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center border rounded bg-gray-900">
        <p className="text-gray-400">No equity data available</p>
      </div>
    );
  }

  const chartData = data.map((equity, index) => ({
    index,
    equity: equity * 100, // Convert to percentage
  }));

  return (
    <div className="w-full">
      {title && <h3 className="text-lg font-semibold mb-2 text-white">{title}</h3>}
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis
            dataKey="index"
            stroke="#9CA3AF"
            fontSize={12}
          />
          <YAxis
            stroke="#9CA3AF"
            fontSize={12}
            tickFormatter={(value) => `${value.toFixed(1)}%`}
          />
          <Tooltip
            formatter={(value: any) => [`${Number(value).toFixed(2)}%`, "Equity"]}
            labelFormatter={(value) => `Day ${value}`}
            contentStyle={{
              backgroundColor: "#1F2937",
              border: "1px solid #374151",
              borderRadius: "6px",
              color: "#F9FAFB"
            }}
          />
          <Line
            type="monotone"
            dataKey="equity"
            stroke="#10B981"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}