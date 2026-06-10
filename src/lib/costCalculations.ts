import type { ProductIngredient } from '@/types/database.types';

export interface IngredientCostInput {
  quantity: number;
  unit_price: number;
  waste_percentage: number;
}

export function ingredientCost(input: IngredientCostInput): number {
  const { quantity, unit_price, waste_percentage } = input;
  const wasteMultiplier = 1 + waste_percentage / 100;
  return quantity * unit_price * wasteMultiplier;
}

export function productTotalCost(items: ProductIngredient[]): number {
  return items.reduce((sum, item) => {
    const price = item.ingredient?.current_price ?? 0;
    return sum + ingredientCost({
      quantity: item.quantity,
      unit_price: price,
      waste_percentage: item.waste_percentage,
    });
  }, 0);
}

export function foodCostPercentage(productCost: number, sellingPrice: number): number {
  if (sellingPrice <= 0) return 0;
  return (productCost / sellingPrice) * 100;
}

export function estimatedProfit(sellingPrice: number, productCost: number): number {
  return sellingPrice - productCost;
}

export function profitMarginPercentage(sellingPrice: number, productCost: number): number {
  if (sellingPrice <= 0) return 0;
  return ((sellingPrice - productCost) / sellingPrice) * 100;
}
