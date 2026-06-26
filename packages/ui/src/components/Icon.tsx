"use client";

import {
  // Umum
  ArrowRight,
  ArrowUpRight,
  Check,
  X,
  Plus,
  Search,
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  // Hero / section accent
  ShieldCheck,
  Sparkles,
  Quote,
  Building2,
  // Produk & benefit
  HeartPulse,
  BriefcaseMedical,
  Stethoscope,
  Zap,
  Lock,
  Mail,
  FileDown,
  FileX,
  Inbox,
  // Admin sidebar
  LayoutDashboard,
  ClipboardList,
  Receipt,
  FileText,
  Siren,
  MessageCircle,
  ScrollText,
  ShieldAlert,
  // Status / badge
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  Send,
  LogOut,
  // User
  User,
  UserCircle,
  Users,
  UserPlus,
  UserCog,
  KeyRound,
  // Sidebar toggle
  PanelLeftClose,
  PanelLeftOpen,
  // Konfigurasi (admin)
  SlidersHorizontal,
  // Social media (lucide-react)
  Instagram,
  Facebook,
  Twitter,
  Linkedin,
  Youtube,
  Github,
  type LucideIcon,
} from "lucide-react";

/**
 * Pemetaan nama icon → komponen.
 * Import seluruh icon yang dipakai di satu tempat agar tree-shaking tetap
 * optimal dan tersedia re-export bernama di seluruh app.
 */
export const Icons: Record<string, LucideIcon> = {
  ArrowRight,
  ArrowUpRight,
  Check,
  X,
  Plus,
  Search,
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  Sparkles,
  Quote,
  Building2,
  HeartPulse,
  BriefcaseMedical,
  Stethoscope,
  Zap,
  Lock,
  Mail,
  FileDown,
  FileX,
  Inbox,
  LayoutDashboard,
  ClipboardList,
  Receipt,
  FileText,
  Siren,
  MessageCircle,
  ScrollText,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  Send,
  LogOut,
  User,
  UserCircle,
  Users,
  UserPlus,
  UserCog,
  KeyRound,
  PanelLeftClose,
  PanelLeftOpen,
  SlidersHorizontal,
  Instagram,
  Facebook,
  Twitter,
  Linkedin,
  Youtube,
  Github,
};

export type IconName = keyof typeof Icons;

export type IconSize = "xs" | "sm" | "md" | "lg" | "xl";

const SIZE_PX: Record<IconSize, number> = {
  xs: 14,
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
};

export interface IconProps {
  name: IconName;
  size?: IconSize | number;
  /** Default 1.75 — sedikit lebih tipis dari default Lucide (2) agar
   *  lebih refined dan tidak "terlalu gemuk" khas AI-generated UI. */
  strokeWidth?: number;
  /** Label untuk aksesibilitas. Jika di-set, icon akan di-umumkan
   *  oleh screen reader; default aria-hidden (dekoratif). */
  label?: string;
  className?: string;
  style?: React.CSSProperties;
}

export function Icon({
  name,
  size = "md",
  strokeWidth = 1.75,
  label,
  className,
  style,
}: IconProps) {
  const Cmp = Icons[name];
  if (!Cmp) return null;
  const px = typeof size === "number" ? size : SIZE_PX[size];
  return (
    <Cmp
      size={px}
      strokeWidth={strokeWidth}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? "img" : undefined}
      className={className}
      style={{ flexShrink: 0, ...style }}
    />
  );
}
