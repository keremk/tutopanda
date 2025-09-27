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
import type { SelectProject } from "@/db/app-schema";
import { Folder, PanelLeftOpen, PanelRightOpen } from "lucide-react";

const NAVBAR_HEIGHT_PX = 64;

export type AppSidebarShellProps = {
  projects: Pick<SelectProject, "id" | "name">[];
  children: React.ReactNode;
  sidebarDefaultOpen?: boolean;
  className?: string;
};

export function AppSidebarShell({
  projects,
  children,
  sidebarDefaultOpen = true,
  className,
}: AppSidebarShellProps) {
  const projectItems = useMemo(() => {
    return projects.map((project) => ({
      id: project.id,
      name:
        project.name && project.name.trim().length > 0
          ? project.name.trim()
          : `Untitled project ${project.id}`,
    }));
  }, [projects]);

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
        <SidebarHeader className="px-4 pb-3 pt-4">
          <SidebarTopSection />
        </SidebarHeader>
        <SidebarContent className="flex-1 px-2 pb-4">
          <ProjectsMenu projectItems={projectItems} />
        </SidebarContent>
        <SidebarFooter className="px-2 pb-4 pt-2">
          <SidebarCollapseControl />
        </SidebarFooter>
      </Sidebar>
      <SidebarInset
        className="md:h-[calc(100svh-4rem)]"
        style={{ minHeight: `calc(100svh - ${NAVBAR_HEIGHT_PX}px)` }}
      >
        <div className="flex h-full flex-1 flex-col">
          <div className="flex items-center gap-2 px-4 py-3 md:hidden">
            <SidebarTrigger className="mr-1" />
            <p className="text-sm font-medium text-foreground">Browse projects</p>
          </div>
          <div className="flex flex-1 flex-col">{children}</div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

type ProjectListItem = {
  id: number;
  name: string;
};

function SidebarTopSection() {
  const { state } = useSidebar();
  const isExpanded = state === "expanded";

  return (
    <div className="flex items-center gap-3 text-sidebar-foreground/80">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg text-sidebar-accent">
        <Folder className="size-4" />
      </span>
      {isExpanded ? (
        <span className="text-sm font-semibold text-sidebar-foreground">Projects</span>
      ) : null}
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
          <PanelLeftOpen className="size-4" />
          <span>Collapse</span>
        </>
      ) : (
        <PanelRightOpen className="size-4" />
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

function ProjectsMenu({ projectItems }: { projectItems: ProjectListItem[] }) {
  const { state } = useSidebar();
  const isExpanded = state === "expanded";

  if (projectItems.length === 0) {
    return (
      <div className="rounded-md border border-sidebar-border/40 bg-sidebar/80 px-3 py-4 text-xs text-sidebar-foreground/70">
        No projects yet. Create one to get started.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <SidebarMenu className="flex-1 space-y-1 overflow-y-auto">
        {projectItems.map((project) => (
          <SidebarMenuItem key={project.id}>
            <SidebarMenuButton asChild tooltip={project.name}>
              <Link href={`/edit?projectId=${project.id}`} className="flex w-full">
                <span
                  className={cn(
                    "flex-1 truncate text-sm text-sidebar-foreground/90",
                    "group-data-[collapsible=icon]:sr-only"
                  )}
                  aria-hidden={!isExpanded}
                >
                  {project.name}
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </div>
  );
}
