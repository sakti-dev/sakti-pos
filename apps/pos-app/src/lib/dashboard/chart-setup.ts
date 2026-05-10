import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  LinearScale,
  Tooltip,
} from "chart.js";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, ArcElement);

export function formatRupiahAxis(value: number): string {
  if (value === 0) {
    return "0";
  }
  if (value >= 1_000_000) {
    return `${value / 1_000_000}jt`;
  }
  if (value >= 1000) {
    return `${value / 1000}rb`;
  }
  return String(value);
}
