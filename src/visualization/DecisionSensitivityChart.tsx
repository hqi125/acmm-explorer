import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import { LineChart } from "echarts/charts";
import { GridComponent, LegendComponent, MarkLineComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { EChartsOption } from "echarts";

echarts.use([LineChart, GridComponent, LegendComponent, MarkLineComponent, TooltipComponent, CanvasRenderer]);

export interface DecisionSensitivitySeries
{
  subjectId: string;
  points: Array<[number, number | null]>;
}

interface DecisionSensitivityChartProps
{
  series: DecisionSensitivitySeries[];
  parameterLabel: string;
  currentValue: number;
}

export function DecisionSensitivityChart({ series, parameterLabel, currentValue }: DecisionSensitivityChartProps)
{
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() =>
  {
    if (containerRef.current === null)
    {
      return undefined;
    }

    const option: EChartsOption = {
      animationDuration: 300,
      grid: {
        left: 54,
        right: 34,
        top: 46,
        bottom: 44,
      },
      legend: {
        top: 0,
        type: "scroll",
        textStyle: {
          color: "#5f605a",
          fontSize: 9,
        },
      },
      tooltip: {
        trigger: "axis",
        valueFormatter: (value: unknown) => typeof value === "number" ? value.toFixed(6) : String(value),
      },
      xAxis: {
        type: "value",
        name: parameterLabel,
        nameLocation: "middle",
        nameGap: 28,
        nameTextStyle: {
          color: "#6c6b64",
          fontSize: 9,
        },
        axisLabel: {
          color: "#6c6b64",
          fontSize: 9,
        },
        splitLine: {
          lineStyle: {
            color: "#e5e0d6",
          },
        },
      },
      yAxis: {
        type: "value",
        name: "Decision score",
        nameTextStyle: {
          color: "#6c6b64",
          fontSize: 9,
        },
        axisLabel: {
          color: "#6c6b64",
          fontSize: 9,
        },
        splitLine: {
          lineStyle: {
            color: "#e5e0d6",
          },
        },
      },
      series: series.map((item, index) => ({
        name: item.subjectId,
        type: "line",
        data: item.points,
        showSymbol: false,
        smooth: false,
        lineStyle: {
          width: 2,
        },
        markLine: index === 0 ? {
          silent: true,
          symbol: "none",
          label: {
            formatter: "Current",
            color: "#6c6b64",
            fontSize: 8,
          },
          lineStyle: {
            type: "dashed",
            width: 1,
          },
          data: [{ xAxis: currentValue }],
        } : undefined,
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
  }, [currentValue, parameterLabel, series]);

  if (series.length === 0)
  {
    return <div className="score-chart-empty">No eligible numeric sensitivity series are available.</div>;
  }

  return (
    <div
      ref={containerRef}
      className="decision-sensitivity-chart"
      role="img"
      aria-label={`Line chart showing decision score sensitivity to ${parameterLabel}`}
    />
  );
}
