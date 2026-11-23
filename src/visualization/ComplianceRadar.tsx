import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import { RadarChart } from "echarts/charts";
import { TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { EChartsOption } from "echarts";

echarts.use([RadarChart, TooltipComponent, CanvasRenderer]);

const option: EChartsOption = {
  animationDuration: 650,
  tooltip: {
    trigger: "item",
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
    indicator: [
      { name: "Goal", max: 1 },
      { name: "Obligation", max: 1 },
      { name: "Boundary", max: 1 },
      { name: "Procedure", max: 1 },
      { name: "Fidelity", max: 1 },
      { name: "Recovery", max: 1 },
    ],
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
          value: [0.84, 0.78, 0.91, 0.72, 0.86, 0.67],
          name: "Example agent",
        },
      ],
    },
  ],
};

export function ComplianceRadar()
{
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() =>
  {
    if (containerRef.current === null)
    {
      return undefined;
    }

    const chart = echarts.init(containerRef.current, undefined, { renderer: "canvas" });
    chart.setOption(option);

    const resizeObserver = new ResizeObserver(() => chart.resize());
    resizeObserver.observe(containerRef.current);

    return () =>
    {
      resizeObserver.disconnect();
      chart.dispose();
    };
  }, []);

  return <div ref={containerRef} className="radar-chart" role="img" aria-label="Example six-axis ACMM compliance radar chart" />;
}
