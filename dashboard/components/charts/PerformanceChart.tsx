"use client";

import { useMemo } from "react";
import {
  AreaChart,
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
      <div className="bg-background border border-border rounded-lg shadow-xl p-3 min-w-[180px]">
        <p className="text-xs text-muted-foreground mb-2">{label}</p>
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-4">
            <span className="text-xs text-muted-foreground">Balance:</span>
            <span className="text-sm font-semibold text-foreground">
              ${balance?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-xs text-muted-foreground">P&L:</span>
            <span className={`text-sm font-semibold ${profit >= 0 ? 'text-green-500' : 'text-red-500'}`}>
              {profit >= 0 ? '+' : ''}${profit?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
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
    return `$${(value / 1000).toFixed(1)}K`;
  }
  return `$${value.toFixed(0)}`;
};

// Format date for X-axis
const formatXAxis = (dateStr: string) => {
  try {
    const parts = dateStr.split('/');
    if (parts.length === 3) {
      const day = parseInt(parts[0]);
      const month = parseInt(parts[1]) - 1;
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return `${day} ${months[month]}`;
    }
    return dateStr;
  } catch {
    return dateStr;
  }
};

export function PerformanceChart({ data }: PerformanceChartProps) {
  // Calculate values from data
  const { initialBalance, currentBalance, totalPnL, pnlPercentage, isPositive, yDomain } = useMemo(() => {
    const initial = data.length > 0 ? data[0].balance : 25000;
    const current = data.length > 0 ? data[data.length - 1].balance : initial;
    const pnl = current - initial;
    const pnlPct = initial > 0 ? (pnl / initial) * 100 : 0;
    
    // Calculate Y domain based on data + reference lines
    const profitTarget = initial * 1.10;
    const maxDrawdown = initial * 0.92;
    
    const allValues = data.map(d => d.balance);
    allValues.push(initial, profitTarget, maxDrawdown);
    
    const minVal = Math.min(...allValues);
    const maxVal = Math.max(...allValues);
    const range = maxVal - minVal || 1;
    const padding = range * 0.1;
    
    return {
      initialBalance: initial,
      currentBalance: current,
      totalPnL: pnl,
      pnlPercentage: pnlPct,
      isPositive: pnl >= 0,
      yDomain: [minVal - padding, maxVal + padding] as [number, number]
    };
  }, [data]);

  const profitTarget = initialBalance * 1.10;
  const maxDrawdown = initialBalance * 0.92;
  const lineColor = isPositive ? "#10b981" : "#ef4444";

  return (
    <Card className="col-span-4">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-muted-foreground" />
            <CardTitle>Equity Curve</CardTitle>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Current P&L</p>
            <p className={`text-lg font-bold ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
              {isPositive ? '+' : ''}${totalPnL.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              <span className="text-sm ml-1">
                ({isPositive ? '+' : ''}{pnlPercentage.toFixed(2)}%)
              </span>
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <ResponsiveContainer width="100%" height={320}>
          <AreaChart data={data} margin={{ top: 10, right: 60, left: 10, bottom: 0 }}>
            <defs>
              <linearGradient id="balanceGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={lineColor} stopOpacity={0.3}/>
                <stop offset="95%" stopColor={lineColor} stopOpacity={0.05}/>
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} vertical={false} />

            <XAxis
              dataKey="date"
              tickFormatter={formatXAxis}
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
              stroke="hsl(var(--border))"
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />

            <YAxis
              tickFormatter={formatYAxis}
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
              stroke="hsl(var(--border))"
              tickLine={false}
              axisLine={false}
              width={55}
              domain={yDomain}
            />

            <Tooltip content={<CustomTooltip />} />

            {/* Initial Balance */}
            <ReferenceLine
              y={initialBalance}
              stroke="hsl(var(--muted-foreground))"
              strokeDasharray="4 4"
              strokeWidth={1}
              label={{ value: 'Initial', position: 'right', fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
            />

            {/* Profit Target +10% */}
            <ReferenceLine
              y={profitTarget}
              stroke="#10b981"
              strokeDasharray="4 4"
              strokeWidth={1}
              label={{ value: '+10%', position: 'right', fill: '#10b981', fontSize: 10 }}
            />

            {/* Max Drawdown -8% */}
            <ReferenceLine
              y={maxDrawdown}
              stroke="#ef4444"
              strokeDasharray="4 4"
              strokeWidth={1}
              label={{ value: '-8%', position: 'right', fill: '#ef4444', fontSize: 10 }}
            />

            <Area
              type="monotone"
              dataKey="balance"
              stroke={lineColor}
              strokeWidth={2}
              fill="url(#balanceGradient)"
              dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>

        {/* Legend */}
        <div className="flex items-center justify-center gap-6 mt-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-0.5 bg-muted-foreground opacity-50"></div>
            <span>Initial</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-0.5 bg-green-500 opacity-50"></div>
            <span>Target +10%</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-0.5 bg-red-500 opacity-50"></div>
            <span>Max DD -8%</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
