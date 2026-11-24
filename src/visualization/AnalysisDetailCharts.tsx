import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import { BarChart, ScatterChart } from "echarts/charts";
import { GridComponent, LegendComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { EChartsOption } from "echarts";

import type {
  AvailabilityScenario,
  RequirementEstimate,
  TrajectoryRunMetric,
  TrajectoryToolUsage,
} from "../data/model";

echarts.use([BarChart, ScatterChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer]);

interface RequirementChartProps
{
  requirements: RequirementEstimate[];
}

export function RequirementChart({ requirements }: RequirementChartProps)
{
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() =>
  {
    if (ref.current === null)
    {
      return undefined;
    }

    const ordered = [...requirements].sort((a, b) => (a.score ?? -1) - (b.score ?? -1));
    const option: EChartsOption = {
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: (params: unknown) =>
        {
          const list = Array.isArray(params) ? params : [];
          const first = list[0] as { dataIndex?: number } | undefined;
          const row = first?.dataIndex === undefined ? undefined : ordered[first.dataIndex];
          if (row === undefined)
          {
            return "";
          }
          const score = row.score === null ? "-" : row.score.toFixed(3);
          const coverage = row.coverage === null ? "-" : `${(row.coverage * 100).toFixed(1)}%`;
          return `${row.requirementId}<br/>${row.dimension}<br/>Score: ${score}<br/>Coverage: ${coverage}`;
        },
      },
      grid: { top: 12, right: 34, bottom: 28, left: 190 },
      xAxis: {
        type: "value",
        min: 0,
        max: 1,
        axisLabel: { fontSize: 9, color: "#77776f" },
        splitLine: { lineStyle: { color: "#e2ded4" } },
      },
      yAxis: {
        type: "category",
        data: ordered.map((row) => row.requirementId),
        axisLabel: {
          width: 168,
          overflow: "truncate",
          fontSize: 9,
          color: "#55574f",
        },
        axisLine: { lineStyle: { color: "#cbc4b5" } },
      },
      series: [{
        type: "bar",
        data: ordered.map((row) => row.score),
        barMaxWidth: 18,
        label: {
          show: true,
          position: "right",
          fontSize: 9,
          formatter: (params: unknown) => { const value = (params as { value?: unknown }).value; return typeof value === "number" ? value.toFixed(3) : "-"; },
        },
      }],
    };

    const chart = echarts.init(ref.current);
    chart.setOption(option);
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(ref.current);
    return () =>
    {
      observer.disconnect();
      chart.dispose();
    };
  }, [requirements]);

  return <div ref={ref} className="detail-chart detail-chart-tall" role="img" aria-label="Requirement compliance scores" />;
}

interface AvailabilityScenarioChartProps
{
  scenarios: AvailabilityScenario[];
}

export function AvailabilityScenarioChart({ scenarios }: AvailabilityScenarioChartProps)
{
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() =>
  {
    if (ref.current === null)
    {
      return undefined;
    }

    const option: EChartsOption = {
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
      legend: { top: 0, textStyle: { fontSize: 10, color: "#55574f" } },
      grid: { top: 42, right: 18, bottom: 80, left: 48 },
      xAxis: {
        type: "category",
        data: scenarios.map((row) => row.scenarioId),
        axisLabel: { rotate: 36, fontSize: 9, color: "#62645d" },
        axisLine: { lineStyle: { color: "#cbc4b5" } },
      },
      yAxis: {
        type: "value",
        min: 0,
        max: 1,
        interval: 0.2,
        axisLabel: { formatter: (value: unknown) => typeof value === "number" ? `${Math.round(value * 100)}%` : String(value), fontSize: 9, color: "#77776f" },
        splitLine: { lineStyle: { color: "#e2ded4" } },
      },
      series: [
        {
          name: "Final availability",
          type: "bar",
          data: scenarios.map((row) => row.availability),
          barMaxWidth: 26,
        },
        {
          name: "First attempt",
          type: "bar",
          data: scenarios.map((row) => row.firstAttemptAvailability),
          barMaxWidth: 26,
        },
      ],
    };

    const chart = echarts.init(ref.current);
    chart.setOption(option);
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(ref.current);
    return () =>
    {
      observer.disconnect();
      chart.dispose();
    };
  }, [scenarios]);

  return <div ref={ref} className="detail-chart" role="img" aria-label="Availability by scenario" />;
}

interface ToolUsageChartProps
{
  rows: TrajectoryToolUsage[];
}

export function ToolUsageChart({ rows }: ToolUsageChartProps)
{
  const ref = useRef<HTMLDivElement>(null);
  const topRows = [...rows].sort((a, b) => (b.calls ?? 0) - (a.calls ?? 0)).slice(0, 12).reverse();

  useEffect(() =>
  {
    if (ref.current === null)
    {
      return undefined;
    }

    const option: EChartsOption = {
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: (params: unknown) =>
        {
          const list = Array.isArray(params) ? params : [];
          const first = list[0] as { dataIndex?: number } | undefined;
          const row = first?.dataIndex === undefined ? undefined : topRows[first.dataIndex];
          if (row === undefined)
          {
            return "";
          }
          const share = row.runShare === null ? "-" : `${(row.runShare * 100).toFixed(1)}%`;
          const error = row.errorRate === null ? "-" : `${(row.errorRate * 100).toFixed(1)}%`;
          return `${row.toolName}<br/>Calls: ${row.calls ?? "-"}<br/>Runs using: ${share}<br/>Error rate: ${error}`;
        },
      },
      grid: { top: 12, right: 42, bottom: 28, left: 196 },
      xAxis: {
        type: "value",
        axisLabel: { fontSize: 9, color: "#77776f" },
        splitLine: { lineStyle: { color: "#e2ded4" } },
      },
      yAxis: {
        type: "category",
        data: topRows.map((row) => row.toolName),
        axisLabel: { width: 178, overflow: "truncate", fontSize: 9, color: "#55574f" },
        axisLine: { lineStyle: { color: "#cbc4b5" } },
      },
      series: [{
        type: "bar",
        data: topRows.map((row) => row.calls),
        barMaxWidth: 18,
        label: { show: true, position: "right", fontSize: 9 },
      }],
    };

    const chart = echarts.init(ref.current);
    chart.setOption(option);
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(ref.current);
    return () =>
    {
      observer.disconnect();
      chart.dispose();
    };
  }, [topRows]);

  return <div ref={ref} className="detail-chart detail-chart-tall" role="img" aria-label="Most used tools" />;
}

interface RunTrajectoryChartProps
{
  rows: TrajectoryRunMetric[];
}

export function RunTrajectoryChart({ rows }: RunTrajectoryChartProps)
{
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() =>
  {
    if (ref.current === null)
    {
      return undefined;
    }

    const valid = rows.filter((row) => row.runIndex !== null && row.toolCalls !== null);
    const data = valid.map((row) => [row.runIndex, row.toolCalls, row.errorRate, row.scenarioId, row.repetition]);
    const option: EChartsOption = {
      tooltip: {
        trigger: "item",
        formatter: (params: unknown) =>
        {
          const item = params as { data?: unknown[] };
          const values = item.data ?? [];
          const error = typeof values[2] === "number" ? `${(values[2] * 100).toFixed(1)}%` : "-";
          return `Run ${values[0] ?? "-"}<br/>${values[3] ?? ""}<br/>Repetition: ${values[4] ?? "-"}<br/>Tool calls: ${values[1] ?? "-"}<br/>Error rate: ${error}`;
        },
      },
      grid: { top: 18, right: 24, bottom: 42, left: 50 },
      xAxis: {
        type: "value",
        name: "Run index",
        nameLocation: "middle",
        nameGap: 28,
        axisLabel: { fontSize: 9, color: "#77776f" },
        splitLine: { lineStyle: { color: "#e2ded4" } },
      },
      yAxis: {
        type: "value",
        name: "Tool calls",
        axisLabel: { fontSize: 9, color: "#77776f" },
        splitLine: { lineStyle: { color: "#e2ded4" } },
      },
      series: [{
        type: "scatter",
        data,
        symbolSize: 7,
      }],
    };

    const chart = echarts.init(ref.current);
    chart.setOption(option);
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(ref.current);
    return () =>
    {
      observer.disconnect();
      chart.dispose();
    };
  }, [rows]);

  return <div ref={ref} className="detail-chart" role="img" aria-label="Tool calls across selected runs" />;
}
