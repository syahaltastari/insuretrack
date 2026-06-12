"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@insuretrack/api-client";

/**
 * Pill-style tabs primitive berbasis Radix Tabs. Visual mengikuti design
 * system: warm-cream track + matcha-600 active state.
 *
 * Pakai untuk stepper-like UI (form multi-bagian) atau tab navigasi.
 * Mirip pattern shadcn/ui `Tabs`, tapi styling pakai token Clay (bukan
 * Tailwind default) agar konsisten dengan `.clay-button`, `.clay-card`,
 * dll. Style di-load dari `.clay-tabs-*` di globals.css.
 *
 * Contoh:
 *   <Tabs defaultValue="personal">
 *     <TabsList>
 *       <TabsTrigger value="personal">Data Pribadi</TabsTrigger>
 *       <TabsTrigger value="contact">Kontak</TabsTrigger>
 *     </TabsList>
 *     <TabsContent value="personal">…</TabsContent>
 *     <TabsContent value="contact">…</TabsContent>
 *   </Tabs>
 *
 * Controlled mode juga disupport:
 *   <Tabs value={active} onValueChange={setActive}>...</Tabs>
 */
const Tabs = TabsPrimitive.Root;

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn("clay-tabs-list", className)}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn("clay-tabs-trigger", className)}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn("clay-tabs-content", className)}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };
