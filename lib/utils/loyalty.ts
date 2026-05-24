export function calculatePointsEarned(
  total: number,
  pointsPerDollar = 1
): number {
  return Math.floor(total * pointsPerDollar)
}

export function calculateRedemptionValue(
  points: number,
  redemptionRate = 100
): number {
  return points / redemptionRate
}

export function calculateMaxRedeemable(
  points: number,
  orderTotal: number,
  redemptionRate = 100
): number {
  const maxFromPoints = calculateRedemptionValue(points, redemptionRate)
  return Math.min(maxFromPoints, orderTotal)
}
