export function downsample<T>(data: T[], threshold = 5000): T[] {
  if (data.length <= threshold) {
    return data
  }

  const step = Math.ceil(data.length / threshold)
  const result: T[] = []
  for (let i = 0; i < data.length; i += step) {
    result.push(data[i])
  }
  const last = data[data.length - 1]
  if (result[result.length - 1] !== last) {
    result.push(last)
  }
  return result
}
