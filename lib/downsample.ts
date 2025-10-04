// Downsampling utilities for chart performance

export interface DataPoint {
  date: string;
  value: number;
}

export function largestTriangleThreeBuckets(
  data: DataPoint[],
  threshold: number
): DataPoint[] {
  if (data.length <= threshold) {
    return data;
  }

  const bucketSize = (data.length - 2) / (threshold - 2);
  const sampled: DataPoint[] = [data[0]]; // Always keep the first point

  for (let i = 1; i < threshold - 1; i++) {
    const bucketStart = Math.floor(i * bucketSize) + 1;
    const bucketEnd = Math.min(Math.floor((i + 1) * bucketSize) + 1, data.length - 1);

    // Find the point in the bucket that creates the largest triangle area
    let maxArea = 0;
    let selectedPoint = data[bucketStart];

    for (let j = bucketStart; j < bucketEnd; j++) {
      // Calculate area of triangle formed by previous point, current point, and next bucket's average
      const nextBucketStart = Math.floor((i + 1) * bucketSize) + 1;
      const nextBucketEnd = Math.min(Math.floor((i + 2) * bucketSize) + 1, data.length - 1);

      let nextAvgX = 0;
      let nextAvgY = 0;
      const nextBucketSize = nextBucketEnd - nextBucketStart;

      if (nextBucketSize > 0) {
        for (let k = nextBucketStart; k < nextBucketEnd; k++) {
          nextAvgX += k;
          nextAvgY += data[k].value;
        }
        nextAvgX /= nextBucketSize;
        nextAvgY /= nextBucketSize;
      } else {
        nextAvgX = data.length - 1;
        nextAvgY = data[data.length - 1].value;
      }

      const prevPoint = sampled[sampled.length - 1];
      const area = Math.abs(
        (prevPoint.value - nextAvgY) * j +
        (nextAvgY - data[j].value) * (sampled.length - 1) +
        (data[j].value - prevPoint.value) * nextAvgX
      ) / 2;

      if (area > maxArea) {
        maxArea = area;
        selectedPoint = data[j];
      }
    }

    sampled.push(selectedPoint);
  }

  sampled.push(data[data.length - 1]); // Always keep the last point
  return sampled;
}

export function simpleThinning(data: DataPoint[], threshold: number): DataPoint[] {
  if (data.length <= threshold) {
    return data;
  }

  const step = Math.ceil(data.length / threshold);
  const thinned: DataPoint[] = [];

  for (let i = 0; i < data.length; i += step) {
    thinned.push(data[i]);
  }

  // Always include the last point
  if (thinned[thinned.length - 1] !== data[data.length - 1]) {
    thinned.push(data[data.length - 1]);
  }

  return thinned;
}