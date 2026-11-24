import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import { RadarChart } from "echarts/charts";
import { LegendComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { EChartsOption } from "echarts";

import { complianceDimensions, type AgentProfile, type ComplianceDimension } from "../data/model";

echarts.use([RadarChart, LegendComponent, TooltipComponent, CanvasRenderer]);

const labels: Record<ComplianceDimension, string> = {
  goal: "Goal",
  obligation: "Obligation",
  boundary: "Boundary",
  procedure: "Procedure",
  fidelity: "Fidelity",
  recovery: "Recovery",
};

interface ComplianceMultiRadarProps
{
  profiles: AgentProfile[];
}

export function ComplianceMultiRadar({ profiles }: ComplianceMultiRadarProps)
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
        trigger: "item",
        valueFormatter: (value: unknown) => typeof value === "number" ? value.toFixed(3) : String(value),
      },
      legend: {
        top: 0,
        type: "scroll",
        textStyle: {
          color: "#55574f",
          fontSize: 10,
        },
      },
      radar: {
        center: ["50%", "56%"],
        radius: "64%",
        splitNumber: 4,
        shape: "polygon",
        axisName: {
          color: "#3f403b",
          fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
          fontSize: 11,
          fontWeight: 600,
        },
        splitArea: {
          areaStyle: {
            color: ["#f8f6f0", "#f1eee6"],
          },
        },
        splitLine: {
          lineStyle: {
            color: "#d8d3c7",
          },
        },
        axisLine: {
          lineStyle: {
            color: "#cbc4b5",
          },
        },
        indicator: complianceDimensions.map((dimension) => ({
          name: labels[dimension],
          max: 1,
        })),
      },
      series: [
        {
          type: "radar",
          symbol: "circle",
          symbolSize: 5,
          lineStyle: {
            width: 2,
          },
          areaStyle: {
            opacity: 0.06,
          },
          emphasis: {
            focus: "series",
          },
          data: profiles.map((profile) => ({
            name: profile.subjectId,
            value: complianceDimensions.map((dimension) =>
              profile.dimensions.find((item) => item.dimension === dimension)?.score ?? null,
            ),
          })),
        },
      ],
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
      className="comparison-chart comparison-radar-chart"
      role="img"
      aria-label="Merged radar comparison of ACMM compliance profiles across agent subjects"
    />
  );
}
