"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/** Các wrapper biểu đồ dùng chung, màu theo theme bằng CSS variables */

const axisStyle = { fill: "rgb(var(--muted))", fontSize: 12 };
const tooltipStyle = {
  backgroundColor: "rgb(var(--surface))",
  border: "1px solid rgb(var(--border))",
  borderRadius: 8,
  color: "rgb(var(--text))",
  fontSize: 13,
};

export interface DailyPoint {
  label: string;
  minutes: number;
}

export function DailyMinutesChart({ data }: { data: DailyPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
        <XAxis dataKey="label" tick={axisStyle} tickLine={false} axisLine={{ stroke: "rgb(var(--border))" }} />
        <YAxis tick={axisStyle} tickLine={false} axisLine={false} width={44} />
        <Tooltip
          contentStyle={tooltipStyle}
          cursor={{ fill: "rgb(var(--surface-2) / 0.6)" }}
          formatter={(value: number | string) => [`${value} phút`, "Thời gian học"]}
        />
        <Bar dataKey="minutes" fill="#3b82f6" radius={[6, 6, 0, 0]} maxBarSize={38} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export interface CountPoint {
  label: string;
  count: number;
}

export function CompletedTasksChart({ data }: { data: CountPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
        <XAxis dataKey="label" tick={axisStyle} tickLine={false} axisLine={{ stroke: "rgb(var(--border))" }} />
        <YAxis tick={axisStyle} tickLine={false} axisLine={false} width={36} allowDecimals={false} />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(value: number | string) => [value, "Nhiệm vụ hoàn thành"]}
        />
        <Line type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 3, fill: "#3b82f6" }} activeDot={{ r: 5 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export interface Slice {
  name: string;
  color: string;
  minutes: number;
}

export function SubjectTimePie({ data }: { data: Slice[] }) {
  if (data.length === 0) {
    return <p className="py-16 text-center text-sm text-muted">Chưa có dữ liệu thời gian học.</p>;
  }
  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie data={data} dataKey="minutes" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={3} stroke="rgb(var(--surface))">
          {data.map((s) => (
            <Cell key={s.name} fill={s.color} />
          ))}
        </Pie>
        <Tooltip contentStyle={tooltipStyle} formatter={(value: number | string) => [`${value} phút`, "Thời gian"]} />
        <Legend wrapperStyle={{ fontSize: 12, color: "rgb(var(--muted))" }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export interface WeekPoint {
  label: string;
  minutes: number;
  completed: number;
}

export function WeeklyCompareChart({ data }: { data: WeekPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
        <XAxis dataKey="label" tick={axisStyle} tickLine={false} axisLine={{ stroke: "rgb(var(--border))" }} />
        <YAxis tick={axisStyle} tickLine={false} axisLine={false} width={44} />
        <Tooltip contentStyle={tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 12, color: "rgb(var(--muted))" }} />
        <Bar name="Thời gian học (phút)" dataKey="minutes" fill="#3b82f6" radius={[6, 6, 0, 0]} maxBarSize={42} />
        <Bar name="Nhiệm vụ hoàn thành" dataKey="completed" fill="#10b981" radius={[6, 6, 0, 0]} maxBarSize={42} />
      </BarChart>
    </ResponsiveContainer>
  );
}
