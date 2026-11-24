import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import { BarChart } from "echarts/charts";
import { GridComponent, LegendComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { EChartsOption } from "echarts";

import { complianceDimensions, type AgentProfile, type ComplianceDimension } from "../data/model";

echarts.use([BarChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer]);

const labels: Record<ComplianceDimension, string> = {
  goal: "Goal",
  obligation: "Obligation",
  boundary: "Boundary",
  procedure: "Procedure",
  fidelity: "Fidelity",
  recovery: "Recovery",
};

interface ComplianceComparisonProps
{
  profiles: AgentProfile[];
}

export function ComplianceComparison({ profiles }: ComplianceComparisonProps)
{
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() =>
  {
    if (containerRef.current === null)
    {
      return undefined;
    }

    const option: EChartsOption = {
      animationDuration: 450,
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        valueFormatter: (value: unknown) => typeof value === "number" ? value.toFixed(3) : String(value),
      },
      legend: {
        top: 0,
        textStyle: {
          fontSize: 10,
          color: "#55574f",
        },
      },
      grid: {
        top: 54,
        left: 44,
        right: 18,
        bottom: 42,
      },
      xAxis: {
        type: "category",
        data: complianceDimensions.map((dimension) => labels[dimension]),
        axisLabel: {
          color: "#62645d",
          fontSize: 10,
        },
        axisLine: {
          lineStyle: { color: "#cbc4b5" },
        },
      },
      yAxis: {
        type: "value",
        min: 0,
        max: 1,
        interval: 0.2,
        axisLabel: {
          color: "#77776f",
          fontSize: 9,
        },
        splitLine: {
          lineStyle: { color: "#e2ded4" },
        },
      },
      series: profiles.map((profile) => ({
        name: profile.subjectId,
        type: "bar",
        data: complianceDimensions.map((dimension) =>
          profile.dimensions.find((item) => item.dimension === dimension)?.score ?? null,
        ),
        barMaxWidth: 30,
        emphasis: { focus: "series" },
      })),
    };

    const chart = echarts.init(containerRef.current, undefined, { renderer: "canvas" });
    chart.setOption(option);

    const resizeObserver = new ResizeObserver(() => chart.resize());
    resizeObserver.observe(containerRef.current);

    return () =>
    {
      resizeObserver.disconnect();
      chart.dispose();
    };
  }, [profiles]);

  return (
    <div
      ref={containerRef}
      className="comparison-chart"
      role="img"
      aria-label="Comparison of ACMM compliance dimensions across agent subjects"
    />
  );
}
