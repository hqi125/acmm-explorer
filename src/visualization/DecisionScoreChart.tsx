import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import { BarChart } from "echarts/charts";
import { GridComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { EChartsOption } from "echarts";
import type { DecisionEvaluation } from "../decision/model";

echarts.use([BarChart, GridComponent, TooltipComponent, CanvasRenderer]);

interface DecisionScoreChartProps
{
  evaluations: DecisionEvaluation[];
}

export function DecisionScoreChart({ evaluations }: DecisionScoreChartProps)
{
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() =>
  {
    if (containerRef.current === null)
    {
      return undefined;
    }

    const rows = evaluations.filter((item) => item.value !== null && item.eligible === true);
    const option: EChartsOption = {
      animationDuration: 350,
      grid: {
        left: 112,
        right: 58,
        top: 10,
        bottom: 24,
      },
      tooltip: {
        trigger: "axis",
        axisPointer: {
          type: "shadow",
        },
        valueFormatter: (value: unknown) => typeof value === "number" ? value.toFixed(6) : String(value),
      },
      xAxis: {
        type: "value",
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
        type: "category",
        inverse: true,
        data: rows.map((item) => item.subjectId),
        axisLabel: {
          color: "#454640",
          fontSize: 9,
          width: 106,
          overflow: "truncate",
        },
        axisTick: {
          show: false,
        },
        axisLine: {
          show: false,
        },
      },
      series: [
        {
          type: "bar",
          data: rows.map((item) => item.value),
          barMaxWidth: 22,
          itemStyle: {
            borderRadius: 3,
          },
          label: {
            show: true,
            position: "right",
            color: "#43443f",
            fontSize: 9,
            distance: 5,
            formatter: (params: any) => typeof params.value === "number" ? params.value.toFixed(4) : "",
          },
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
  }, [evaluations]);

  const eligibleCount = evaluations.filter((item) => item.value !== null && item.eligible === true).length;
  if (eligibleCount === 0)
  {
    return <div className="score-chart-empty">No eligible numeric decision scores to plot.</div>;
  }

  return (
    <div
      ref={containerRef}
      className="decision-score-chart"
      role="img"
      aria-label="Horizontal bar chart comparing raw decision function scores for eligible agents"
    />
  );
}
