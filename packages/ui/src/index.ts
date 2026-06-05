// Public API of @insuretrack/ui — re-exports all shared design system
// primitives so apps can `import { Chart, SafeImage, Toaster, ... } from "@insuretrack/ui"`.

// Plain components
export { Icon, Icons, type IconName, type IconSize, type IconProps } from "./components/Icon";
export { Pagination } from "./components/Pagination";
export { SafeImage } from "./components/SafeImage";
export { StatusBadge } from "./components/StatusBadge";
export {
  ChartCard,
  ChartTooltip,
  statusColor,
  chartFormatters,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "./components/Chart";

// shadcn primitives
export {
  Button,
  buttonVariants,
  type ButtonProps,
} from "./components/ui/button";
export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "./components/ui/dialog";
export {
  AlertDialog,
  AlertDialogPortal,
  AlertDialogOverlay,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from "./components/ui/alert-dialog";
export { Confirm } from "./components/ui/confirm";
export { Toaster } from "./components/ui/sonner";
