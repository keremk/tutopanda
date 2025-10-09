"use client";

import Link from "next/link";
import { useMemo } from "react";

import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
  SidebarInset,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Folder, PanelLeftOpen, PanelRightOpen } from "lucide-react";

const NAVBAR_HEIGHT_PX = 64;

export type SidebarLectureItem = {
  id: number;
  title: string;
};

export type AppSidebarShellProps = {
  lectures: SidebarLectureItem[];
  children: React.ReactNode;
  sidebarDefaultOpen?: boolean;
  activeLectureId?: number | null;
  className?: string;
};

export function AppSidebarShell({
  lectures,
  children,
  sidebarDefaultOpen = true,
  activeLectureId,
  className,
}: AppSidebarShellProps) {
  const lectureItems = useMemo(() => {
    return lectures.map((lecture) => {
      const trimmedTitle = lecture.title?.trim();

      return {
        id: lecture.id,
        title: trimmedTitle && trimmedTitle.length > 0 ? trimmedTitle : "Untitled",
      };
    });
  }, [lectures]);

  return (
    <SidebarProvider
      defaultOpen={sidebarDefaultOpen}
      className={cn("flex min-h-0 w-full", className)}
      style={{ minHeight: `calc(100svh - ${NAVBAR_HEIGHT_PX}px)` }}
    >
      <Sidebar
        collapsible="icon"
        className="border-r border-sidebar-border/50 bg-sidebar/95 text-sidebar-foreground shadow-sm supports-[backdrop-filter]:bg-sidebar/85 md:top-16 md:h-[calc(100svh-4rem)]"
        style={{
          top: `${NAVBAR_HEIGHT_PX}px`,
          height: `calc(100svh - ${NAVBAR_HEIGHT_PX}px)`,
        }}
      >
        <SidebarHeader className="px-1 pb-3 pt-7">
          <SidebarCollapseControl />
          <SidebarTopSection />
        </SidebarHeader>
        <SidebarContent className="flex-1 px-2 pb-4">
          <LecturesMenu lectureItems={lectureItems} activeLectureId={activeLectureId ?? null} />
        </SidebarContent>
        <SidebarFooter className="px-2 pb-4 pt-2" />
      </Sidebar>
      <SidebarInset
        className="md:h-[calc(100svh-4rem)]"
        style={{ height: `calc(100svh - ${NAVBAR_HEIGHT_PX}px)` }}
      >
        <div className="flex h-full flex-col overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 md:hidden">
            <SidebarTrigger className="mr-1" />
            <p className="text-sm font-medium text-foreground">Browse lectures</p>
          </div>
          <div className="flex flex-1 flex-col overflow-hidden">{children}</div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

type NormalizedLectureItem = {
  id: number;
  title: string;
};

function SidebarTopSection() {
  const { state } = useSidebar();
  const isExpanded = state === "expanded";

  if (!isExpanded) {
    return null;
  }

  return (
    <div className="mt-4 flex items-center gap-3 text-sidebar-foreground/80">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg text-sidebar-accent">
        <Folder className="size-4" />
      </span>
      <span className="text-sm font-semibold text-sidebar-foreground">Lectures</span>
    </div>
  );
}

function SidebarCollapseControl() {
  const { state, toggleSidebar } = useSidebar();
  const isExpanded = state === "expanded";

  const button = (
    <Button
      type="button"
      variant="ghost"
      className={cn(
        "w-full justify-start gap-2 text-sm text-sidebar-foreground/80",
        "hover:bg-sidebar-accent/15 hover:text-sidebar-foreground",
        !isExpanded && "px-2"
      )}
      onClick={toggleSidebar}
    >
      {isExpanded ? (
        <>
          <PanelLeftOpen className="!size-5" />
          <span>Collapse</span>
        </>
      ) : (
        <PanelRightOpen className="!size-5" />
      )}
    </Button>
  );

  if (isExpanded) {
    return button;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="right" align="start">
        Expand sidebar
      </TooltipContent>
    </Tooltip>
  );
}

function LecturesMenu({
  lectureItems,
  activeLectureId,
}: {
  lectureItems: NormalizedLectureItem[];
  activeLectureId: number | null;
}) {
  const { state } = useSidebar();
  const isExpanded = state === "expanded";

  if (!isExpanded) {
    return null;
  }

  if (lectureItems.length === 0) {
    return (
      <div className="rounded-md border border-sidebar-border/40 bg-sidebar/80 px-3 py-4 text-xs text-sidebar-foreground/70">
        No lectures yet. Create one to get started.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <SidebarMenu className="flex-1 space-y-1 overflow-y-auto">
        {lectureItems.map((lecture) => {
          const isActive = lecture.id === activeLectureId;

          return (
            <SidebarMenuItem key={lecture.id}>
              <SidebarMenuButton
                asChild
                tooltip={lecture.title}
                isActive={isActive}
                className="transition-colors data-[active=true]:bg-[color:var(--sidebar-active-bg)] data-[active=true]:text-sidebar-foreground data-[active=true]:shadow-sm"
              >
                <Link href={`/edit/${lecture.id}`} className="flex w-full">
                  <span
                    className={cn(
                      "flex-1 truncate text-sm text-sidebar-foreground/90",
                      "group-data-[collapsible=icon]:sr-only"
                    )}
                    aria-hidden={!isExpanded}
                  >
                    {lecture.title}
                  </span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </div>
  );
}
