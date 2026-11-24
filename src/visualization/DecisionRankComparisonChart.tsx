import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import { LineChart } from "echarts/charts";
import { GridComponent, LegendComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { EChartsOption } from "echarts";

echarts.use([LineChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer]);

export interface DecisionRankComparisonRow
{
  subjectId: string;
  leftRank: number | null;
  rightRank: number | null;
}

interface DecisionRankComparisonChartProps
{
  leftLabel: string;
  rightLabel: string;
  rows: DecisionRankComparisonRow[];
}

export function DecisionRankComparisonChart({ leftLabel, rightLabel, rows }: DecisionRankComparisonChartProps)
{
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() =>
  {
    if (containerRef.current === null)
    {
      return undefined;
    }

    const plotted = rows.filter((row) => row.leftRank !== null || row.rightRank !== null);
    const maximumRank = Math.max(2, ...plotted.flatMap((row) => [row.leftRank ?? 0, row.rightRank ?? 0]));
    const option: EChartsOption = {
      animationDuration: 300,
      grid: {
        left: 48,
        right: 34,
        top: 48,
        bottom: 34,
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
        trigger: "item",
        formatter: (params: any) =>
        {
          const data = Array.isArray(params.data) ? params.data : [];
          const rank = data[1];
          const side = data[0] === leftLabel ? leftLabel : rightLabel;
          return `${params.seriesName}<br/>${side}: ${typeof rank === "number" ? `#${rank}` : "Unavailable"}`;
        },
      },
      xAxis: {
        type: "category",
        data: [leftLabel, rightLabel],
        boundaryGap: false,
        axisLabel: {
          color: "#5f605a",
          fontSize: 9,
          width: 180,
          overflow: "truncate",
        },
        axisTick: {
          show: false,
        },
      },
      yAxis: {
        type: "value",
        inverse: true,
        min: 1,
        max: maximumRank,
        minInterval: 1,
        interval: 1,
        axisLabel: {
          color: "#6c6b64",
          fontSize: 9,
          formatter: (value: number) => `#${value}`,
        },
        splitLine: {
          lineStyle: {
            color: "#e5e0d6",
          },
        },
      },
      series: plotted.map((row) => ({
        name: row.subjectId,
        type: "line",
        connectNulls: false,
        symbolSize: 8,
        lineStyle: {
          width: 2,
        },
        data: [
          row.leftRank === null ? [leftLabel, null] : [leftLabel, row.leftRank],
          row.rightRank === null ? [rightLabel, null] : [rightLabel, row.rightRank],
        ],
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
  }, [leftLabel, rightLabel, rows]);

  if (rows.every((row) => row.leftRank === null && row.rightRank === null))
  {
    return <div className="score-chart-empty">No comparable eligible ranking positions are available.</div>;
  }

  return (
    <div
      ref={containerRef}
      className="decision-rank-comparison-chart"
      role="img"
      aria-label={`Rank comparison between ${leftLabel} and ${rightLabel}`}
    />
  );
}
