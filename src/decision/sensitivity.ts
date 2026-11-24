export interface DecisionSensitivitySeriesLike
{
  subjectId: string;
  points: Array<[number, number | null]>;
}

export interface DecisionSensitivityCrossing
{
  parameterValue: number;
  firstSubjectId: string;
  secondSubjectId: string;
  beforeLeader: string;
  afterLeader: string;
}

export function detectDecisionSensitivityCrossings(
  series: DecisionSensitivitySeriesLike[],
): DecisionSensitivityCrossing[]
{
  const crossings: DecisionSensitivityCrossing[] = [];

  for (let firstIndex = 0; firstIndex < series.length; firstIndex += 1)
  {
    for (let secondIndex = firstIndex + 1; secondIndex < series.length; secondIndex += 1)
    {
      const first = series[firstIndex];
      const second = series[secondIndex];
      const count = Math.min(first.points.length, second.points.length);
      let previousNonZero: { index: number; difference: number } | null = null;

      for (let pointIndex = 0; pointIndex < count; pointIndex += 1)
      {
        const [xFirst, yFirst] = first.points[pointIndex];
        const [xSecond, ySecond] = second.points[pointIndex];
        if (Math.abs(xFirst - xSecond) > 1e-9 || yFirst === null || ySecond === null)
        {
          continue;
        }

        const difference = yFirst - ySecond;
        if (Math.abs(difference) < 1e-10)
        {
          continue;
        }

        if (previousNonZero !== null && Math.sign(previousNonZero.difference) !== Math.sign(difference))
        {
          const [xBefore] = first.points[previousNonZero.index];
          const zeroSamples: number[] = [];
          for (let zeroIndex = previousNonZero.index + 1; zeroIndex < pointIndex; zeroIndex += 1)
          {
            const firstValue = first.points[zeroIndex]?.[1] ?? null;
            const secondValue = second.points[zeroIndex]?.[1] ?? null;
            if (firstValue !== null && secondValue !== null && Math.abs(firstValue - secondValue) < 1e-10)
            {
              zeroSamples.push(first.points[zeroIndex][0]);
            }
          }

          const parameterValue = zeroSamples.length > 0
            ? zeroSamples[Math.floor(zeroSamples.length / 2)]
            : xBefore + (xFirst - xBefore)
              * (Math.abs(previousNonZero.difference) / (Math.abs(previousNonZero.difference) + Math.abs(difference)));

          crossings.push({
            parameterValue,
            firstSubjectId: first.subjectId,
            secondSubjectId: second.subjectId,
            beforeLeader: previousNonZero.difference > 0 ? first.subjectId : second.subjectId,
            afterLeader: difference > 0 ? first.subjectId : second.subjectId,
          });
        }

        previousNonZero = { index: pointIndex, difference };
      }
    }
  }

  return crossings.sort((left, right) => left.parameterValue - right.parameterValue);
}
