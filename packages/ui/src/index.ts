// Public API of @insuretrack/ui — re-exports all shared design system
// primitives so apps can `import { Chart, SafeImage, Toaster, ... } from "@insuretrack/ui"`.

// Plain components
export { Icon, Icons, type IconName, type IconSize, type IconProps } from "./components/Icon";
export { Pagination } from "./components/Pagination";
export { SafeImage } from "./components/SafeImage";
export { Skeleton, SkeletonText, SkeletonCard, SkeletonTable } from "./components/Skeleton";
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

// Admin filter primitives (added in admin-filter-enhancement phase)
export {
  DateRangePicker,
  type DateRangeValue,
  type DateRangePickerProps,
} from "./components/DateRangePicker";
export {
  FilterChipBar,
  type FilterChip,
  type FilterChipBarProps,
} from "./components/FilterChipBar";
export {
  FilterSelect,
  type FilterSelectOption,
  type FilterSelectProps,
} from "./components/FilterSelect";

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
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverAnchor,
} from "./components/ui/popover";
export { Calendar, type CalendarProps } from "./components/ui/calendar";
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
export {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "./components/ui/tabs";
export { Toaster } from "./components/ui/sonner";
