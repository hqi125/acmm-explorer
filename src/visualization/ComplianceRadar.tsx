import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import { RadarChart } from "echarts/charts";
import { TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { EChartsOption } from "echarts";

import { complianceDimensions, type ComplianceDimension } from "../data/model";

echarts.use([RadarChart, TooltipComponent, CanvasRenderer]);

const labels: Record<ComplianceDimension, string> = {
  goal: "Goal",
  obligation: "Obligation",
  boundary: "Boundary",
  procedure: "Procedure",
  fidelity: "Fidelity",
  recovery: "Recovery",
};

interface ComplianceRadarProps
{
  name?: string;
  values?: Partial<Record<ComplianceDimension, number | null>>;
  ariaLabel?: string;
}

const demoValues: Record<ComplianceDimension, number> = {
  goal: 0.84,
  obligation: 0.78,
  boundary: 0.91,
  procedure: 0.72,
  fidelity: 0.86,
  recovery: 0.67,
};

export function ComplianceRadar({
  name = "Example agent",
  values = demoValues,
  ariaLabel = "Six-axis ACMM compliance radar chart",
}: ComplianceRadarProps)
{
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() =>
  {
    if (containerRef.current === null)
    {
      return undefined;
    }

    const radarValues = complianceDimensions.map((dimension) => values[dimension] ?? 0);
    const option: EChartsOption = {
      animationDuration: 500,
      tooltip: {
        trigger: "item",
        valueFormatter: (value: unknown) => typeof value === "number" ? value.toFixed(3) : String(value),
      },
      radar: {
        center: ["50%", "50%"],
        radius: "67%",
        splitNumber: 4,
        shape: "polygon",
        axisName: {
          color: "#3f403b",
          fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
          fontSize: 12,
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
          symbolSize: 6,
          lineStyle: {
            width: 2,
            color: "#2d5d50",
          },
          itemStyle: {
            color: "#2d5d50",
          },
          areaStyle: {
            color: "rgba(45, 93, 80, 0.19)",
          },
          data: [
            {
              value: radarValues,
              name,
            },
          ],
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
  }, [name, values]);

  return <div ref={containerRef} className="radar-chart" role="img" aria-label={ariaLabel} />;
}
