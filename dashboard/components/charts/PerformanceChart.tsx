"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp } from "lucide-react";

interface PerformanceChartProps {
  data: {
    date: string;
    balance: number;
    profit: number;
  }[];
}

// Custom Tooltip Component
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const balance = payload[0].value;
    const profit = payload[0].payload.profit;

    return (
      <div className="bg-background/95 backdrop-blur-sm border border-border rounded-lg shadow-xl p-3 min-w-[200px]">
        <p className="text-xs text-muted-foreground mb-2">{label}</p>
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-4">
            <span className="text-xs text-muted-foreground">Equity:</span>
            <span className="text-sm font-semibold text-foreground">
              ${balance?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          {profit !== 0 && (
            <div className="flex items-center justify-between gap-4">
              <span className="text-xs text-muted-foreground">P&L:</span>
              <span className={`text-sm font-semibold ${profit >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                {profit >= 0 ? '+' : ''}${profit?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          )}
        </div>
      </div>
    );
  }
  return null;
};

// Format currency for Y-axis
const formatYAxis = (value: number) => {
  if (value >= 1000000) {
    return `$${(value / 1000000).toFixed(1)}M`;
  } else if (value >= 1000) {
    return `$${(value / 1000).toFixed(0)}K`;
  }
  return `$${value.toLocaleString('en-US')}`;
};

// Format date for X-axis
const formatXAxis = (dateStr: string) => {
  try {
    // Parse French date format (dd/mm/yyyy)
    const parts = dateStr.split('/');
    if (parts.length === 3) {
      const date = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
      const day = date.getDate();
      const month = date.toLocaleDateString('en-US', { month: 'short' });
      return `${day} ${month}`;
    }
    return dateStr;
  } catch {
    return dateStr;
  }
};

export function PerformanceChart({ data }: PerformanceChartProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  // Calculate reference lines
  const initialBalance = data.length > 0 ? data[0].balance : 0;
  const profitTarget = initialBalance * 1.10; // +10% target
  const maxDrawdown = initialBalance * 0.92; // -8% max drawdown

  const { defaultDomain } = useMemo(() => {
    const values: number[] = [];
    for (const d of data) {
      if (Number.isFinite(d.balance)) values.push(d.balance);
    }
    if (Number.isFinite(initialBalance)) values.push(initialBalance);
    if (Number.isFinite(profitTarget)) values.push(profitTarget);
    if (Number.isFinite(maxDrawdown)) values.push(maxDrawdown);

    const min = values.length ? Math.min(...values) : 0;
    const max = values.length ? Math.max(...values) : 0;
    const range = Math.max(1, max - min);
    const pad = range * 0.15;

    return {
      defaultDomain: [min - pad, max + pad] as [number, number],
    };
  }, [data, initialBalance, maxDrawdown, profitTarget]);

  const [yDomain, setYDomain] = useState<[number, number]>(defaultDomain);
  const [hasUserZoomed, setHasUserZoomed] = useState(false);

  // Keep yDomain synced ONLY if user hasn't manually zoomed
  // This prevents the chart from jumping around on every data update
  useEffect(() => {
    if (!hasUserZoomed) {
      setYDomain(defaultDomain);
    }
  }, [defaultDomain, hasUserZoomed]);

  const zoom = (direction: "in" | "out") => {
    setHasUserZoomed(true);
    const [min, max] = yDomain;
    const center = (min + max) / 2;
    const range = Math.max(1, max - min);
    const factor = direction === "in" ? 0.85 : 1.15;
    const nextRange = range * factor;
    setYDomain([center - nextRange / 2, center + nextRange / 2]);
  };

  const resetZoom = () => {
    setHasUserZoomed(false);
    setYDomain(defaultDomain);
  };

  const onWheel: React.WheelEventHandler<HTMLDivElement> = (e) => {
    // Zoom in/out with wheel. Trackpad scroll generates wheel too.
    if (e.ctrlKey) return; // avoid fighting browser zoom
    e.preventDefault();
    zoom(e.deltaY < 0 ? "in" : "out");
  };

  // Calculate current balance and performance
  const currentBalance = data.length > 0 ? data[data.length - 1].balance : initialBalance;
  const totalPnL = currentBalance - initialBalance;
  const pnlPercentage = initialBalance !== 0 ? ((totalPnL / initialBalance) * 100) : 0;
  const isPositive = totalPnL >= 0;

  // Determine line color based on performance
  const lineColor = isPositive ? "#10b981" : "#ef4444"; // Green or Red
  const areaFillUrl = isPositive ? "url(#colorGreen)" : "url(#colorRed)";

  return (
    <Card className="col-span-4">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-muted-foreground" />
            <CardTitle>Equity Curve</CardTitle>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Current P&L</p>
              <p className={`font-bold ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
                {isPositive ? '+' : ''}${totalPnL.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                <span className="text-xs ml-1">
                  ({isPositive ? '+' : ''}{pnlPercentage.toFixed(2)}%)
                </span>
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => zoom("in")}
                className="h-8 px-3 rounded-md border border-border bg-background hover:bg-accent hover:text-accent-foreground transition"
              >
                Zoom +
              </button>
              <button
                type="button"
                onClick={() => zoom("out")}
                className="h-8 px-3 rounded-md border border-border bg-background hover:bg-accent hover:text-accent-foreground transition"
              >
                Zoom -
              </button>
              <button
                type="button"
                onClick={resetZoom}
                className="h-8 px-3 rounded-md border border-border bg-background hover:bg-accent hover:text-accent-foreground transition"
              >
                Reset
              </button>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pl-2">
        <div ref={wrapRef} onWheel={onWheel} className="relative">
          <ResponsiveContainer width="100%" height={380}>
            <ComposedChart
              data={data}
              margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
            >
            {/* Gradient Definitions */}
            <defs>
              <linearGradient id="colorGreen" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                <stop offset="95%" stopColor="#10b981" stopOpacity={0.01}/>
              </linearGradient>
              <linearGradient id="colorRed" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ef4444" stopOpacity={0.2}/>
                <stop offset="95%" stopColor="#ef4444" stopOpacity={0.01}/>
              </linearGradient>
              <linearGradient id="lineGradient" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#3b82f6" />
                <stop offset="50%" stopColor="#10b981" />
                <stop offset="100%" stopColor="#10b981" />
              </linearGradient>
            </defs>

            {/* Grid - subtle horizontal lines */}
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="hsl(var(--border))"
              opacity={0.3}
              vertical={false}
            />

            {/* X Axis - Dates */}
            <XAxis
              dataKey="date"
              tickFormatter={formatXAxis}
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
              stroke="hsl(var(--border))"
              tickLine={false}
              axisLine={{ stroke: 'hsl(var(--border))', strokeWidth: 1 }}
            />

            {/* Y Axis - USD amounts */}
            <YAxis
              tickFormatter={formatYAxis}
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
              stroke="hsl(var(--border))"
              tickLine={false}
              axisLine={{ stroke: 'hsl(var(--border))', strokeWidth: 1 }}
              width={60}
              domain={yDomain}
            />

            {/* Custom Tooltip */}
            <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'hsl(var(--border))', strokeWidth: 1, strokeDasharray: '5 5' }} />

            {/* Reference Lines */}
            {/* Initial Balance Line */}
            <ReferenceLine
              y={initialBalance}
              stroke="hsl(var(--muted-foreground))"
              strokeDasharray="3 3"
              strokeWidth={1.5}
              label={{
                value: 'Initial',
                position: 'right',
                fill: 'hsl(var(--muted-foreground))',
                fontSize: 11,
              }}
            />

            {/* Profit Target Line (+10%) */}
            <ReferenceLine
              y={profitTarget}
              stroke="#10b981"
              strokeDasharray="5 5"
              strokeWidth={1.5}
              label={{
                value: 'Target +10%',
                position: 'right',
                fill: '#10b981',
                fontSize: 11,
              }}
            />

            {/* Max Drawdown Line (-8%) */}
            <ReferenceLine
              y={maxDrawdown}
              stroke="#ef4444"
              strokeDasharray="5 5"
              strokeWidth={1.5}
              label={{
                value: 'Max DD -8%',
                position: 'right',
                fill: '#ef4444',
                fontSize: 11,
              }}
            />

            {/* Area - Filled area under the curve */}
            <Area
              type="monotone"
              dataKey="balance"
              fill={areaFillUrl}
              stroke="none"
              baseValue="dataMin"
              animationDuration={1000}
              animationEasing="ease-out"
            />

            {/* Line - Main equity curve */}
            <Line
              type="monotone"
              dataKey="balance"
              stroke={lineColor}
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 5, strokeWidth: 2, stroke: lineColor, fill: 'hsl(var(--background))' }}
              animationDuration={1000}
              animationEasing="ease-out"
            />
            </ComposedChart>
          </ResponsiveContainer>

          <div className="pointer-events-none absolute right-3 top-3 text-[11px] text-muted-foreground">
            Molette = zoom
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center justify-center gap-6 mt-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="w-3 h-0.5 bg-muted-foreground"></div>
            <span>Initial Balance</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-0.5 bg-green-500" style={{ backgroundImage: 'repeating-linear-gradient(to right, #10b981 0px, #10b981 5px, transparent 5px, transparent 8px)' }}></div>
            <span>Profit Target (+10%)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-0.5 bg-red-500" style={{ backgroundImage: 'repeating-linear-gradient(to right, #ef4444 0px, #ef4444 5px, transparent 5px, transparent 8px)' }}></div>
            <span>Max Drawdown (-8%)</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
